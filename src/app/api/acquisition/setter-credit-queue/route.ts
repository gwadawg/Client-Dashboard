import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { buildDemoCreditFormUrlForAppointment } from '@/lib/acquisition-setter-notify';

type QueueStatus = 'pending' | 'credited' | 'all';

type AppointmentRow = {
  id: string;
  ghl_appointment_id: string | null;
  lead_id: string | null;
  lead_name: string | null;
  phone: string | null;
  booked_at: string | null;
  scheduled_at: string | null;
  setter_name: string | null;
  call_taken_by: string | null;
  booking_source: string | null;
  status: string;
  demo_credit_claimed_at: string | null;
  intro_call_id: string | null;
  acquisition_leads?:
    | { ghl_contact_id: string | null }
    | { ghl_contact_id: string | null }[]
    | null;
};

function leadGhlContactId(row: AppointmentRow): string | null {
  const lead = row.acquisition_leads;
  if (!lead) return null;
  if (Array.isArray(lead)) return lead[0]?.ghl_contact_id ?? null;
  return lead.ghl_contact_id ?? null;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inferSetterName(email: string | null, reps: Array<{ name: string }>): string {
  if (!email) return '';
  const localPart = email.split('@')[0] ?? '';
  const normalizedEmail = normalize(localPart);
  return (
    reps.find(
      rep =>
        normalize(rep.name) === normalizedEmail ||
        normalize(rep.name).includes(normalizedEmail) ||
        normalizedEmail.includes(normalize(rep.name)),
    )?.name ?? ''
  );
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get('status') ?? 'pending') as QueueStatus;
  const search = searchParams.get('search')?.trim() ?? '';
  const mineOnly = searchParams.get('mine') === 'true';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  if (!['pending', 'credited', 'all'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  let query = ctx.service
    .from('acquisition_appointments')
    .select(
      'id, ghl_appointment_id, lead_id, lead_name, phone, booked_at, scheduled_at, setter_name, call_taken_by, booking_source, status, demo_credit_claimed_at, intro_call_id, acquisition_leads(ghl_contact_id)',
      { count: 'exact' },
    )
    .eq('appointment_type', 'demo')
    .order('booked_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (status === 'pending') query = query.is('intro_call_id', null);
  if (status === 'credited') query = query.not('intro_call_id', 'is', null);

  if (search) {
    const term = `*${search.replace(/[%,()]/g, ' ')}*`;
    query = query.or(`lead_name.ilike.${term},phone.ilike.${term},setter_name.ilike.${term}`);
  }

  const [{ data: rows, error, count }, { data: reps }, { data: userData }] = await Promise.all([
    query,
    ctx.service.from('agents').select('name').eq('pay_type', 'b2b_setter').order('name'),
    ctx.service.auth.admin.getUserById(ctx.userId),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userEmail = userData?.user?.email ?? null;
  const inferredName = inferSetterName(userEmail, reps ?? []);

  let mapped = await Promise.all(
    ((rows ?? []) as AppointmentRow[]).map(async row => {
      const credited = !!row.intro_call_id && !!row.demo_credit_claimed_at;
      const formUrl =
        row.intro_call_id && row.demo_credit_claimed_at
          ? null
          : await buildDemoCreditFormUrlForAppointment(ctx.service, row.id);

      return {
        id: row.id,
        ghl_appointment_id: row.ghl_appointment_id,
        ghl_contact_id: leadGhlContactId(row),
        lead_name: row.lead_name,
        phone: row.phone,
        booked_at: row.booked_at,
        scheduled_at: row.scheduled_at,
        setter_name: row.setter_name,
        call_taken_by: row.call_taken_by,
        booking_source: row.booking_source,
        status: row.status,
        credited,
        credited_at: row.demo_credit_claimed_at,
        form_url: formUrl,
      };
    }),
  );

  if (mineOnly && inferredName) {
    const mine = normalize(inferredName);
    mapped = mapped.filter(row => {
      const assigned = row.setter_name ?? row.call_taken_by ?? '';
      return !assigned || normalize(assigned) === mine || normalize(assigned).includes(mine);
    });
  }

  return NextResponse.json({
    rows: mapped,
    total: count ?? mapped.length,
    page,
    inferred_setter_name: inferredName || null,
    currentUser: userEmail ? { email: userEmail } : null,
  });
}

import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

type ApptRow = {
  appointment_type: string;
  status: string;
  setter_name: string | null;
  how_booked: string | null;
  booked_at: string | null;
  scheduled_at: string | null;
};

function inRange(iso: string | null, from: string, to: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= from && d <= to;
}

function tookPlace(status: string): boolean {
  return status === 'showed' || status === 'no_show' || status === 'team_no_show';
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to required' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('v_acquisition_appointment_enriched')
    .select('appointment_type, status, setter_name, how_booked, booked_at, scheduled_at')
    .eq('appointment_type', 'demo')
    .gte('booked_at', `${from}T00:00:00.000Z`)
    .lte('booked_at', `${to}T23:59:59.999Z`)
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bySetter = new Map<string, { booked: number; showed: number; taken: number }>();

  for (const row of (data ?? []) as ApptRow[]) {
    const setter = row.setter_name?.trim();
    if (!setter || setter === '2') continue;
    const selfBooked = (row.how_booked ?? '').toLowerCase().includes('customer');
    if (selfBooked) continue;

    const bucket = bySetter.get(setter) ?? { booked: 0, showed: 0, taken: 0 };
    if (inRange(row.booked_at, from, to)) bucket.booked++;
    if (inRange(row.scheduled_at, from, to)) {
      if (row.status === 'showed') bucket.showed++;
      if (tookPlace(row.status)) bucket.taken++;
    }
    bySetter.set(setter, bucket);
  }

  const setters = [...bySetter.entries()]
    .map(([setter, v]) => ({
      setter,
      demos_booked: v.booked,
      demos_showed: v.showed,
      demos_taken_place: v.taken,
      demo_show_rate: v.taken > 0 ? (v.showed / v.taken) * 100 : null,
    }))
    .sort((a, b) => b.demos_showed - a.demos_showed);

  return NextResponse.json({ setters, from, to });
}

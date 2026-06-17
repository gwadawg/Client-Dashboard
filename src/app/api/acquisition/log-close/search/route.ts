import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

const LIMIT = 25;

/** GET /api/acquisition/log-close/search?q= — find leads for closer form picker */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ rows: [], total: 0 });
  }

  const safe = q.replace(/[,()*]/g, ' ').trim();
  const term = `*${safe}*`;

  const { data, error } = await ctx.service
    .from('acquisition_leads')
    .select('id, lead_name, email, phone, ghl_contact_id, created_at')
    .or(`lead_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
    .not('ghl_contact_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    rows: (data ?? []).map(row => ({
      id: row.id,
      lead_name: row.lead_name,
      email: row.email,
      phone: row.phone,
      ghl_contact_id: row.ghl_contact_id,
    })),
    total: data?.length ?? 0,
  });
}

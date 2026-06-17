import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';
import { DEFAULT_DISPLAY_TIMEZONE, getZonedHourDay, normalizeTimeZone } from '@/lib/time';

// Heat map data is gated by the Heat Maps hub permission (legacy per-type keys still honored).

/** Resolve the IANA zone to bucket an event in: its own lead zone → contact's zone → default. */
function resolveZone(
  ownTz: string | null | undefined,
  contactId: string | null | undefined,
  contactZones: Map<string, string>,
): string {
  const own = normalizeTimeZone(ownTz);
  if (own) return own;
  if (contactId) {
    const fromContact = contactZones.get(contactId);
    if (fromContact) return fromContact;
  }
  return DEFAULT_DISPLAY_TIMEZONE;
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const client_id = searchParams.get('client_id');
  const live_only = searchParams.get('live_only') === 'true';
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');

  if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 });
  if (!['new_leads', 'pickup_rate', 'show_rate'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const denied = requirePermission(ctx, 'heatmaps');
  if (denied) return denied;

  // Capture after narrowing so nested closures (buildContactZones) keep the typed client.
  const service = ctx.service;

  let liveClientIds: string[] | null = null;
  if (live_only && !client_id) {
    liveClientIds = await getLiveClientIds(service);
  }

  function applyClientFilter<T extends object>(q: T): T {
    if (client_id) return (q as any).eq('client_id', client_id);
    if (liveClientIds) return (q as any).in('client_id', liveClientFilter(liveClientIds));
    return q;
  }

  const empty24x7 = () => Array.from({ length: 24 }, () => new Array(7).fill(0));

  // Map ghl_contact_id → the lead's IANA zone, so dials/appointments without their own zone
  // can still be bucketed in the prospect's local time (resolved from the matching lead).
  async function buildContactZones(): Promise<Map<string, string>> {
    let q = applyClientFilter(
      service
        .from('events')
        .select('ghl_contact_id, lead_timezone')
        .eq('event_type', 'lead')
        .not('lead_timezone', 'is', null)
        .not('ghl_contact_id', 'is', null),
    );
    q = q.limit(100000);
    const { data } = await q;
    const map = new Map<string, string>();
    for (const r of data ?? []) {
      const tz = normalizeTimeZone(r.lead_timezone);
      if (r.ghl_contact_id && tz && !map.has(r.ghl_contact_id)) {
        map.set(r.ghl_contact_id, tz);
      }
    }
    return map;
  }

  if (type === 'new_leads') {
    let q = applyClientFilter(
      service.from('events').select('occurred_at, lead_timezone').eq('event_type', 'lead'),
    );
    if (start_date) q = q.gte('occurred_at', `${start_date}T00:00:00.000Z`);
    if (end_date)   q = q.lte('occurred_at', `${end_date}T23:59:59.999Z`);
    q = q.limit(100000);

    const { data } = await q;
    const grid = empty24x7();
    for (const e of data ?? []) {
      const zone = normalizeTimeZone(e.lead_timezone) ?? DEFAULT_DISPLAY_TIMEZONE;
      const hd = getZonedHourDay(e.occurred_at, zone);
      if (hd) grid[hd.hour][hd.day]++;
    }
    return NextResponse.json({ grid });
  }

  if (type === 'pickup_rate') {
    let q = applyClientFilter(
      service
        .from('events')
        .select('occurred_at, is_pickup, lead_timezone, ghl_contact_id')
        .eq('event_type', 'dial'),
    );
    if (start_date) q = q.gte('occurred_at', `${start_date}T00:00:00.000Z`);
    if (end_date)   q = q.lte('occurred_at', `${end_date}T23:59:59.999Z`);
    q = q.limit(100000);

    const [{ data }, contactZones] = await Promise.all([q, buildContactZones()]);
    const dials = empty24x7();
    const pickups = empty24x7();
    for (const e of data ?? []) {
      const zone = resolveZone(e.lead_timezone, e.ghl_contact_id, contactZones);
      const hd = getZonedHourDay(e.occurred_at, zone);
      if (!hd) continue;
      dials[hd.hour][hd.day]++;
      if (e.is_pickup) pickups[hd.hour][hd.day]++;
    }
    const grid = dials.map((row, h) =>
      row.map((t, d) => t > 0 ? Math.round((pickups[h][d] / t) * 100) : -1)
    );
    return NextResponse.json({ grid });
  }

  if (type === 'show_rate') {
    let q = applyClientFilter(
      service.from('events')
        .select('scheduled_at, event_type, lead_timezone, ghl_contact_id')
        .in('event_type', ['show', 'no_show'])
        .not('scheduled_at', 'is', null)
    );
    if (start_date) q = q.gte('scheduled_at', `${start_date}T00:00:00.000Z`);
    if (end_date)   q = q.lte('scheduled_at', `${end_date}T23:59:59.999Z`);
    q = q.limit(100000);

    const [{ data }, contactZones] = await Promise.all([q, buildContactZones()]);
    const total = empty24x7();
    const shows = empty24x7();
    for (const e of data ?? []) {
      const zone = resolveZone(e.lead_timezone, e.ghl_contact_id, contactZones);
      const hd = getZonedHourDay(e.scheduled_at, zone);
      if (!hd) continue;
      total[hd.hour][hd.day]++;
      if (e.event_type === 'show') shows[hd.hour][hd.day]++;
    }
    const grid = total.map((row, h) =>
      row.map((t, d) => t > 0 ? Math.round((shows[h][d] / t) * 100) : -1)
    );
    return NextResponse.json({ grid });
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}

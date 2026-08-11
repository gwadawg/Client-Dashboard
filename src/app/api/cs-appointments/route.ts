import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import {
  type CsAppointmentEnriched,
  listCsAppointmentsForClickup,
  listCsAppointmentsInRange,
  listUpcomingCsAppointments,
  mapNextCsAppointmentByClickup,
} from '@/lib/cs-appointments';

function endOfUtcDay(ymd: string): string {
  return `${ymd}T23:59:59.999Z`;
}

function startOfUtcDay(ymd: string): string {
  return `${ymd}T00:00:00.000Z`;
}

/**
 * GET /api/cs-appointments
 *   ?scope=upcoming          — next 14 days (Ops / Roster)
 *   ?scope=next_by_clickup&clickup_task_ids=a,b,c — next scheduled per ClickUp ID
 *   ?from=&to=               — range for Calendars view (YMD or ISO)
 *   ?clickup_task_id=X       — appointments for one client (Client File)
 */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const url = new URL(req.url);
  const scope = url.searchParams.get('scope');
  const clickupTaskId = url.searchParams.get('clickup_task_id')?.trim() || null;
  const clickupIdsRaw = url.searchParams.get('clickup_task_ids')?.trim() || '';
  const fromParam = url.searchParams.get('from')?.trim() || '';
  const toParam = url.searchParams.get('to')?.trim() || '';

  try {
    if (scope === 'upcoming') {
      const appointments = await listUpcomingCsAppointments(ctx.service);
      const unmapped = appointments.filter(a => !a.client_id).length;
      return NextResponse.json({ appointments, unmapped_count: unmapped });
    }

    if (scope === 'next_by_clickup') {
      const ids = clickupIdsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const map = await mapNextCsAppointmentByClickup(ctx.service, ids);
      const next_by_clickup: Record<string, CsAppointmentEnriched> = {};
      for (const [k, v] of map) next_by_clickup[k] = v;
      return NextResponse.json({ next_by_clickup });
    }

    if (fromParam && toParam) {
      const fromIso = fromParam.includes('T') ? fromParam : startOfUtcDay(fromParam);
      const toIso = toParam.includes('T') ? toParam : endOfUtcDay(toParam);
      const appointments = await listCsAppointmentsInRange(ctx.service, {
        fromIso,
        toIso,
      });
      const unmapped = appointments.filter(a => !a.client_id).length;
      return NextResponse.json({ appointments, unmapped_count: unmapped });
    }

    if (clickupTaskId) {
      const history = url.searchParams.get('history') === '1';
      const appointments = await listCsAppointmentsForClickup(ctx.service, clickupTaskId, {
        history,
      });
      return NextResponse.json({ appointments });
    }

    return NextResponse.json(
      {
        error:
          'Provide scope=upcoming, scope=next_by_clickup&clickup_task_ids=, from=&to=, or clickup_task_id=',
      },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

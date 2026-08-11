import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  CS_CALL_TYPES,
  deleteCsCalendarConfig,
  listCsCalendarConfig,
  type CsCallType,
  upsertCsCalendarConfig,
} from '@/lib/cs-appointments';

function isCsCallType(v: string): v is CsCallType {
  return (CS_CALL_TYPES as readonly string[]).includes(v);
}

/** GET /api/cs-calendars — list registered GHL CS calendar IDs */
export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  try {
    const calendars = await listCsCalendarConfig(ctx.service);
    return NextResponse.json({ calendars });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/cs-calendars — upsert { calendar_id, calendar_name, call_type } */
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const calendarId = String(body.calendar_id ?? '').trim();
  const calendarName = String(body.calendar_name ?? '').trim();
  const callTypeRaw = String(body.call_type ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '');

  const callTypeMap: Record<string, CsCallType> = {
    onboarding: 'onboarding',
    launch: 'launch',
    checkin: 'checkin',
    check_in: 'checkin',
  };
  const callType = callTypeMap[callTypeRaw] ?? (isCsCallType(callTypeRaw) ? callTypeRaw : null);

  if (!calendarId) {
    return NextResponse.json({ error: 'calendar_id is required' }, { status: 400 });
  }
  if (!calendarName) {
    return NextResponse.json({ error: 'calendar_name is required' }, { status: 400 });
  }
  if (!callType) {
    return NextResponse.json(
      { error: `call_type must be one of: ${CS_CALL_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const calendar = await upsertCsCalendarConfig(ctx.service, {
      calendar_id: calendarId,
      calendar_name: calendarName,
      call_type: callType,
    });
    return NextResponse.json({ ok: true, calendar });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/cs-calendars?calendar_id=… */
export async function DELETE(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  const calendarId = new URL(req.url).searchParams.get('calendar_id')?.trim() || '';
  if (!calendarId) {
    return NextResponse.json({ error: 'calendar_id is required' }, { status: 400 });
  }

  try {
    await deleteCsCalendarConfig(ctx.service, calendarId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

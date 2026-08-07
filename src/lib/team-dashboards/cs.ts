/**
 * Client Success Command payload — Laura's daily plate.
 * Light queries only (no full client-health rebuild).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  csCallTypeLabel,
  listUpcomingCsAppointments,
  type CsCallType,
} from '@/lib/cs-appointments';
import {
  CS_TOUCHPOINT_LABELS,
  endOfUtcDayIso,
  startOfUtcDayIso,
  type CsTouchpointType,
} from '@/lib/cs-touchpoints';
import { buildCsDayContext, type CsDayContext } from '@/lib/team-dashboards/cs-playbook';
import { todayYmdInCallCenterTz } from '@/lib/time';
import { eodFormHref } from '@/lib/eod-forms';

const FOLLOWUP_LIMIT = 20;

export type CsFollowupRow = {
  id: string;
  client_id: string;
  client_name: string;
  touchpoint_type: CsTouchpointType;
  touchpoint_label: string;
  status: string;
  due_at: string;
  is_overdue: boolean;
};

export type CsCallTodayRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  call_type: CsCallType | null;
  call_type_label: string;
  scheduled_at: string;
  calendar_name: string | null;
  title: string | null;
};

export type CsCommandPayload = {
  generated_at: string;
  today: string;
  counts: {
    overdue_followups: number;
    today_followups: number;
    calls_today: number;
    eod_submitted: boolean;
  };
  /** Overdue first, then due today — open/snoozed only. */
  followups: CsFollowupRow[];
  calls_today: CsCallTodayRow[];
  dayContext: CsDayContext;
  eod: {
    submitted: boolean;
    href: string;
    label: string;
  };
  definitions: Record<string, string>;
};

type TouchJoin = {
  id: string;
  client_id: string;
  touchpoint_type: CsTouchpointType;
  status: string;
  due_at: string;
  clients: { id: string; name: string } | null | { id: string; name: string }[];
};

function clientName(join: TouchJoin['clients']): string {
  if (!join) return 'Unknown client';
  if (Array.isArray(join)) return join[0]?.name ?? 'Unknown client';
  return join.name ?? 'Unknown client';
}

function mapFollowup(row: TouchJoin, todayStart: string): CsFollowupRow {
  const is_overdue = row.due_at < todayStart;
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: clientName(row.clients),
    touchpoint_type: row.touchpoint_type,
    touchpoint_label: CS_TOUCHPOINT_LABELS[row.touchpoint_type] ?? row.touchpoint_type,
    status: row.status,
    due_at: row.due_at,
    is_overdue,
  };
}

/** Followups open/snoozed with due_at ≤ end of today (overdue + today). */
async function loadDueFollowups(
  service: SupabaseClient,
  todayStart: string,
  todayEnd: string,
): Promise<{ rows: CsFollowupRow[]; overdue: number; today: number }> {
  const { data, error } = await service
    .from('cs_touchpoints')
    .select(
      'id, client_id, touchpoint_type, status, due_at, clients(id, name)',
    )
    .in('status', ['open', 'snoozed'])
    .lte('due_at', todayEnd)
    .order('due_at', { ascending: true })
    .limit(FOLLOWUP_LIMIT);

  if (error) throw new Error(error.message);

  const mapped = ((data ?? []) as unknown as TouchJoin[]).map(r =>
    mapFollowup(r, todayStart),
  );
  const overdue = mapped.filter(r => r.is_overdue).length;
  const today = mapped.filter(r => !r.is_overdue).length;

  // Accurate counts even when list is capped
  const [overdueCountRes, todayCountRes] = await Promise.all([
    service
      .from('cs_touchpoints')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'snoozed'])
      .lt('due_at', todayStart),
    service
      .from('cs_touchpoints')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'snoozed'])
      .gte('due_at', todayStart)
      .lte('due_at', todayEnd),
  ]);

  return {
    rows: mapped,
    overdue: overdueCountRes.count ?? overdue,
    today: todayCountRes.count ?? today,
  };
}

async function loadEodSubmitted(
  service: SupabaseClient,
  workDate: string,
): Promise<boolean> {
  const { count, error } = await service
    .from('eod_form_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('department', 'client_success')
    .eq('work_date', workDate);
  if (error) {
    // Non-fatal — plate still useful without EOD status
    console.warn('[cs-command] eod check failed', error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

export async function buildCsCommandPayload(
  service: SupabaseClient,
): Promise<CsCommandPayload> {
  const now = new Date();
  const today = todayYmdInCallCenterTz(now);
  const todayStart = startOfUtcDayIso(now);
  const todayEnd = endOfUtcDayIso(now);
  const dayContext = buildCsDayContext(now);

  const [followups, appointments, eodSubmitted] = await Promise.all([
    loadDueFollowups(service, todayStart, todayEnd),
    listUpcomingCsAppointments(service, { days: 1, now }),
    loadEodSubmitted(service, today),
  ]);

  // Keep calls that land on calendar day "today" (YMD in call-center tz already via list window).
  // listUpcoming is forward-looking from now — fine for remaining calls today.
  const calls_today: CsCallTodayRow[] = appointments.map(a => ({
    id: a.id,
    client_id: a.client_id,
    client_name: a.client_name,
    call_type: a.call_type,
    call_type_label: csCallTypeLabel(a.call_type),
    scheduled_at: a.scheduled_at,
    calendar_name: a.calendar_name,
    title: a.title,
  }));

  return {
    generated_at: now.toISOString(),
    today,
    counts: {
      overdue_followups: followups.overdue,
      today_followups: followups.today,
      calls_today: calls_today.length,
      eod_submitted: eodSubmitted,
    },
    followups: followups.rows,
    calls_today,
    dayContext,
    eod: {
      submitted: eodSubmitted,
      href: eodFormHref('client_success'),
      label: 'Client Success EOD',
    },
    definitions: {
      followups:
        'Open or snoozed cs_touchpoints with due_at on or before end of today (UTC day boundary matches Follow-ups queue).',
      calls_today: 'Scheduled CS calendar appointments in the next 24 hours.',
      eod: 'Whether any client_success EOD row exists for work_date = today (call-center calendar date).',
    },
  };
}

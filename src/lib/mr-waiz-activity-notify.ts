/**
 * Internal team activity feed → Slack team channel slug `mr_waiz` (C0BRRU9C4SH).
 * Fire-and-forget after successful writes; never throws to callers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOSEBOT_TICKET_STATUS_META, type ClosebotTicketStatus } from '@/lib/closebot';
import { EOD_DEPARTMENT_LABELS, type EodDepartment } from '@/lib/eod-forms';
import { isSlackConfigured, postToTeamChannel } from '@/lib/slack-notify';

export const MR_WAIZ_ACTIVITY_SLUG = 'mrwaiz';
/** Documented production channel id — register under Automations as slug mrwaiz. */
export const MR_WAIZ_ACTIVITY_CHANNEL_ID = 'C0BRRU9C4SH';

export const MR_WAIZ_ACTIVITY_EVENT_KEYS = [
  'team.meeting_logged',
  'team.meeting_completed',
  'client.work_log_created',
  'team.eod_submitted',
  'cs.touchpoint_done',
  'plan.task_done',
  'closebot.ticket_created',
  'closebot.ticket_status_changed',
  'closebot.agent_log_created',
] as const;

export type MrWaizActivityEventKey = (typeof MR_WAIZ_ACTIVITY_EVENT_KEYS)[number];

export type MrWaizActivityActor = {
  userId?: string | null;
  /** Prefer when known (EOD label, reporter_name, etc.). */
  label?: string | null;
};

function line(label: string, value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return `${label}: ${v}`;
}

function truncate(text: string, max = 400): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function formatActorLabel(label: string | null | undefined): string {
  const t = label?.trim();
  return t || 'Unknown user';
}

/** Pure message builders for tests. */
export function formatMrWaizActivityMessage(
  eventKey: MrWaizActivityEventKey,
  who: string,
  fields: Record<string, string | null | undefined>,
): string {
  const whoLine = `Who: *${formatActorLabel(who)}*`;
  const footer = '_Posted by Mr. Waiz_';
  const details = (rows: Array<string | null>) =>
    [whoLine, '', ...rows.filter((r): r is string => !!r), '', footer].join('\n');

  switch (eventKey) {
    case 'team.meeting_logged':
      return [
        '📞 *Meeting logged*',
        details([
          line('Title', fields.title),
          line('Type', fields.call_type),
          line('When', fields.called_at),
          line('Participants', fields.participants),
          fields.summary ? line('Summary', truncate(fields.summary)) : null,
        ]),
      ].join('\n');

    case 'team.meeting_completed':
      return [
        '✅ *Team meeting completed*',
        details([
          line('Title', fields.title),
          line('Scheduled', fields.scheduled_at),
          line('Participants', fields.participants),
          fields.summary ? line('Summary', truncate(fields.summary)) : null,
          fields.recording_url ? line('Recording', fields.recording_url) : null,
        ]),
      ].join('\n');

    case 'client.work_log_created':
      return [
        `📝 *Work log created* — ${fields.work_type ?? 'log'}`,
        details([
          line('Client', fields.client_name),
          line('Title', fields.title),
          line('Status', fields.status),
          fields.change_description
            ? line('Details', truncate(fields.change_description))
            : null,
          fields.hypothesis ? line('Hypothesis', truncate(fields.hypothesis)) : null,
          fields.bet_category ? line('Category', fields.bet_category) : null,
          fields.loom_url ? line('Loom', fields.loom_url) : null,
        ]),
      ].join('\n');

    case 'team.eod_submitted':
      return [
        '📋 *EOD submitted*',
        details([
          line('Department', fields.department_label ?? fields.department),
          line('Team member', fields.agent_name),
          line('Work date', fields.work_date),
          fields.accomplishments
            ? line('Accomplishments', truncate(fields.accomplishments))
            : null,
          fields.tomorrow_priorities
            ? line('Tomorrow', truncate(fields.tomorrow_priorities))
            : null,
          fields.productivity_rating
            ? line('Productivity', fields.productivity_rating)
            : null,
        ]),
      ].join('\n');

    case 'cs.touchpoint_done':
      return [
        '💬 *CS touchpoint completed*',
        details([
          line('Client', fields.client_name),
          line('Type', fields.touchpoint_type),
          fields.slack_snippet ? line('Slack proof', truncate(fields.slack_snippet)) : null,
          fields.completion_note
            ? line('Note', truncate(fields.completion_note))
            : null,
        ]),
      ].join('\n');

    case 'plan.task_done':
      return [
        '☑️ *Account plan task done*',
        details([
          line('Client', fields.client_name),
          line('Task', fields.title),
          fields.scheduled_for ? line('Scheduled', fields.scheduled_for) : null,
          fields.completion_report
            ? line('Report', truncate(fields.completion_report))
            : null,
          fields.work_type ? line('Work type', fields.work_type) : null,
        ]),
      ].join('\n');

    case 'closebot.ticket_created':
      return [
        '🎫 *Closebot ticket logged*',
        details([
          line('Reporter', fields.reporter_name),
          line('Client', fields.client_name),
          line('Agent', fields.agent_name),
          line('Bug type', fields.bug_type),
          line('Status', fields.status_label ?? fields.status),
          fields.description ? line('Description', truncate(fields.description)) : null,
          fields.contact_url ? line('Contact', fields.contact_url) : null,
        ]),
      ].join('\n');

    case 'closebot.ticket_status_changed':
      return [
        '🎫 *Closebot ticket status*',
        details([
          line('Client', fields.client_name),
          line('Agent', fields.agent_name),
          line('Ticket', fields.ticket_id ? `\`${fields.ticket_id}\`` : null),
          line(
            'Status',
            fields.from_status_label && fields.to_status_label
              ? `${fields.from_status_label} → ${fields.to_status_label}`
              : `${fields.from_status ?? '?'} → ${fields.to_status ?? '?'}`,
          ),
          fields.status_notes ? line('Notes', truncate(fields.status_notes)) : null,
          fields.description ? line('Description', truncate(fields.description, 200)) : null,
        ]),
      ].join('\n');

    case 'closebot.agent_log_created':
      return [
        '🤖 *Closebot agent update logged*',
        details([
          line('Agent', fields.agent_name),
          line('Status', fields.status),
          line('Problem solved', truncate(fields.problem_solved ?? '')),
          line('Change reason', truncate(fields.change_reason ?? '')),
          fields.outcome_notes
            ? line('Outcome notes', truncate(fields.outcome_notes))
            : null,
        ]),
      ].join('\n');

    default: {
      const _exhaustive: never = eventKey;
      return String(_exhaustive);
    }
  }
}

export function closebotStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  const meta = CLOSEBOT_TICKET_STATUS_META[status as ClosebotTicketStatus];
  return meta?.label ?? status;
}

export async function resolveActorDisplayName(
  service: SupabaseClient,
  actor: MrWaizActivityActor,
): Promise<string> {
  const labeled = actor.label?.trim();
  if (labeled) return labeled;

  const userId = actor.userId?.trim();
  if (!userId) return 'Unknown user';

  const { data: employee } = await service
    .from('agents')
    .select('name')
    .eq('user_id', userId)
    .maybeSingle();
  if (employee?.name && String(employee.name).trim()) {
    return String(employee.name).trim();
  }

  try {
    const { data, error } = await service.auth.admin.getUserById(userId);
    if (!error && data.user?.email) return data.user.email;
  } catch {
    // ignore
  }

  return 'Unknown user';
}

export async function resolveClientName(
  service: SupabaseClient,
  clientId: string | null | undefined,
): Promise<string | null> {
  if (!clientId) return null;
  const { data } = await service.from('clients').select('name').eq('id', clientId).maybeSingle();
  return data?.name ? String(data.name) : null;
}

export type NotifyMrWaizActivityInput = {
  eventKey: MrWaizActivityEventKey;
  actor: MrWaizActivityActor;
  fields: Record<string, string | null | undefined>;
};

/**
 * Post to mr_waiz. Never throws. Safe to call without await from routes
 * (prefer void notify...().catch(...) or fire-and-forget with void).
 */
export async function notifyMrWaizActivity(
  service: SupabaseClient,
  input: NotifyMrWaizActivityInput,
): Promise<void> {
  try {
    if (!isSlackConfigured()) return;

    const who = await resolveActorDisplayName(service, input.actor);
    const text = formatMrWaizActivityMessage(input.eventKey, who, input.fields);
    const result = await postToTeamChannel(service, MR_WAIZ_ACTIVITY_SLUG, text);
    if (!result) {
      console.warn(
        `[mr-waiz-activity] skipped ${input.eventKey}: no active channel slug "${MR_WAIZ_ACTIVITY_SLUG}"`,
      );
      return;
    }
    if (!result.ok) {
      console.warn(`[mr-waiz-activity] Slack failed for ${input.eventKey}:`, result.error);
    }
  } catch (err) {
    console.warn(
      `[mr-waiz-activity] ${input.eventKey} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export function eodDepartmentLabel(department: string): string {
  if (department in EOD_DEPARTMENT_LABELS) {
    return EOD_DEPARTMENT_LABELS[department as EodDepartment];
  }
  return department;
}

export function summarizeEodAccomplishments(responses: Record<string, unknown>): string | null {
  const raw = responses.accomplishments;
  if (Array.isArray(raw)) {
    const items = raw.map(x => String(x).trim()).filter(Boolean);
    return items.length ? items.join('; ') : null;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

/**
 * Internal team activity feed → Slack team channel slug `mrwaiz` (C0BRRU9C4SH).
 * Fire-and-forget after successful human writes; never throws to callers.
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
  'team.meeting_updated',
  'client.work_log_created',
  'client.work_log_updated',
  'team.eod_submitted',
  'cs.touchpoint_done',
  'plan.task_done',
  'plan.week_created',
  'plan.week_status',
  'closebot.ticket_created',
  'closebot.ticket_status_changed',
  'closebot.agent_log_created',
  'client.created',
  'client.updated',
  'client.deleted',
  'client.call_logged',
  'client.call_updated',
  'client.kickoff_saved',
  'client.launched',
  'client.launch_kit_generated',
  'client.launch_kit_sent',
  'client.churned',
  'client.note_created',
  'client.contact_changed',
  'client.offer_added',
  'dial.example_saved',
  'acq.closer_form_submitted',
  'acq.demo_booked_credit',
  'acq.intro_reflection',
  'appt.dispositioned',
  'credit.assigned',
  'commitment.logged',
  'commitment.updated',
  /** Catch-all for remaining human writes (ads, schedule, agents, library, etc.). */
  'ops.logged',
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

/** Human-readable list of changed client fields for roster updates. */
export function summarizeChangedFields(
  keys: string[],
  opts?: { max?: number },
): string | null {
  const cleaned = [...new Set(keys.map(k => k.trim()).filter(Boolean))];
  if (!cleaned.length) return null;
  const max = opts?.max ?? 12;
  const shown = cleaned.slice(0, max);
  const extra = cleaned.length - shown.length;
  const label = shown.join(', ');
  return extra > 0 ? `${label} (+${extra} more)` : label;
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

    case 'team.meeting_updated':
      return [
        '📞 *Call Library updated*',
        details([
          line('Title', fields.title),
          line('Type', fields.call_type),
          fields.changed_fields ? line('Changed', fields.changed_fields) : null,
          fields.summary ? line('Summary', truncate(fields.summary)) : null,
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

    case 'client.work_log_updated':
      return [
        `📝 *Work log updated* — ${fields.work_type ?? 'log'}`,
        details([
          line('Client', fields.client_name),
          line('Title', fields.title),
          line('Status', fields.status),
          fields.changed_fields ? line('Changed', fields.changed_fields) : null,
          fields.outcome ? line('Outcome', truncate(fields.outcome)) : null,
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

    case 'plan.week_created':
      return [
        '📅 *Week plan created*',
        details([
          line('Client', fields.client_name),
          line('Week of', fields.week_start),
          fields.severity ? line('Severity', fields.severity) : null,
          fields.task_count ? line('Tasks', fields.task_count) : null,
          fields.why ? line('Why', truncate(fields.why)) : null,
        ]),
      ].join('\n');

    case 'plan.week_status':
      return [
        '📅 *Week plan status*',
        details([
          line('Client', fields.client_name),
          line('Week of', fields.week_start),
          line('Status', fields.status),
          fields.founder_note ? line('Note', truncate(fields.founder_note)) : null,
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

    case 'client.created':
      return [
        '🆕 *Client added to roster*',
        details([
          line('Client', fields.client_name),
          line('Lifecycle', fields.lifecycle_status),
          line('Offer', fields.offer ?? fields.reporting_type),
          fields.service_program ? line('Program', fields.service_program) : null,
          fields.primary_contact ? line('Contact', fields.primary_contact) : null,
        ]),
      ].join('\n');

    case 'client.updated':
      return [
        '✏️ *Client roster updated*',
        details([
          line('Client', fields.client_name),
          fields.lifecycle_change ? line('Lifecycle', fields.lifecycle_change) : null,
          fields.ads_paused_change ? line('Ads', fields.ads_paused_change) : null,
          fields.changed_fields ? line('Changed', fields.changed_fields) : null,
          fields.note ? line('Note', truncate(fields.note)) : null,
        ]),
      ].join('\n');

    case 'client.deleted':
      return [
        '🗑️ *Client removed from roster*',
        details([line('Client', fields.client_name)]),
      ].join('\n');

    case 'client.call_logged':
      return [
        '🎧 *Client call logged*',
        details([
          line('Client', fields.client_name),
          line('Type', fields.call_type),
          line('When', fields.called_at),
          fields.disposition ? line('Disposition', fields.disposition) : null,
          fields.attendees ? line('Attendees', fields.attendees) : null,
          fields.notes ? line('Notes', truncate(fields.notes)) : null,
          fields.recording_url ? line('Recording', fields.recording_url) : null,
        ]),
      ].join('\n');

    case 'client.call_updated':
      return [
        '🎧 *Client call updated*',
        details([
          line('Client', fields.client_name),
          line('Type', fields.call_type),
          fields.changed_fields ? line('Changed', fields.changed_fields) : null,
          fields.recording_url ? line('Recording', fields.recording_url) : null,
        ]),
      ].join('\n');

    case 'client.kickoff_saved':
      return [
        '🚀 *Kickoff saved*',
        details([
          line('Client', fields.client_name),
          line('Mode', fields.saved_mode),
          fields.kickoff_complete ? line('Complete', fields.kickoff_complete) : null,
          fields.recording_url ? line('OB recording', fields.recording_url) : null,
          fields.ghl_location_id ? line('GHL location', fields.ghl_location_id) : null,
        ]),
      ].join('\n');

    case 'client.launched':
      return [
        '🟢 *Client launched*',
        details([
          line('Client', fields.client_name),
          line('Launch date', fields.launch_date),
          fields.completed_by ? line('Completed by', fields.completed_by) : null,
          fields.recording_url ? line('Launch call', fields.recording_url) : null,
        ]),
      ].join('\n');

    case 'client.launch_kit_generated':
      return [
        '📘 *Launch Kit generated*',
        details([
          line('Client', fields.client_name),
          line('Version', fields.version),
          line('Variant', fields.variant),
          line('Go-live', fields.go_live_date),
          fields.app_url ? line('Open', fields.app_url) : null,
        ]),
      ].join('\n');

    case 'client.launch_kit_sent':
      return [
        '📤 *Launch Kit sent to client*',
        details([
          line('Client', fields.client_name),
          line('Version', fields.version),
          fields.channel ? line('Channel', fields.channel) : null,
        ]),
      ].join('\n');

    case 'client.churned':
      return [
        '🔴 *Client churned*',
        details([
          line('Client', fields.client_name),
          line('Effective', fields.effective_churn_date),
          line('Reason', fields.reason_code),
          fields.feedback ? line('Feedback', truncate(fields.feedback)) : null,
          fields.recording_url ? line('Exit call', fields.recording_url) : null,
        ]),
      ].join('\n');

    case 'client.note_created':
      return [
        '📌 *Client note added*',
        details([
          line('Client', fields.client_name),
          line('Type', fields.note_type),
          fields.reason_code ? line('Reason', fields.reason_code) : null,
          line('Note', truncate(fields.body ?? '')),
        ]),
      ].join('\n');

    case 'client.contact_changed':
      return [
        `👤 *Client contact ${fields.action ?? 'changed'}*`,
        details([
          line('Client', fields.client_name),
          line('Contact', fields.contact_name),
          fields.role ? line('Role', fields.role) : null,
          fields.email ? line('Email', fields.email) : null,
          fields.phone ? line('Phone', fields.phone) : null,
        ]),
      ].join('\n');

    case 'client.offer_added':
      return [
        '➕ *Offer / sub-account added*',
        details([
          line('Origin client', fields.origin_client_name),
          line('New offer', fields.client_name),
          fields.offer ?? fields.reporting_type
            ? line('Offer', fields.offer ?? fields.reporting_type)
            : null,
        ]),
      ].join('\n');

    case 'dial.example_saved':
      return [
        '⭐ *Dial example saved*',
        details([
          line('Title', fields.title),
          line('Domain', fields.domain),
          line('Grade', fields.grade),
          fields.lead_type ? line('Lead type', fields.lead_type) : null,
          fields.recording_url ? line('Recording', fields.recording_url) : null,
        ]),
      ].join('\n');

    case 'acq.closer_form_submitted':
      return [
        '💼 *Closer form submitted*',
        details([
          line('Closer', fields.closer_name),
          line('Lead', fields.lead_name),
          fields.offer_presented ? line('Offer presented', fields.offer_presented) : null,
          fields.closed_on_call ? line('Closed on call', fields.closed_on_call) : null,
          fields.recording_url ? line('Recording', fields.recording_url) : null,
        ]),
      ].join('\n');

    case 'acq.demo_booked_credit':
      return [
        '📅 *Demo booking credit*',
        details([
          line('Setter', fields.setter_name),
          line('Lead', fields.lead_name),
          line('Source', fields.booking_source),
          fields.booked_at ? line('Booked at', fields.booked_at) : null,
        ]),
      ].join('\n');

    case 'acq.intro_reflection':
      return [
        '🪞 *Intro reflection submitted*',
        details([
          line('Setter', fields.setter_name),
          line('Lead', fields.lead_name),
          fields.showed ? line('Showed', fields.showed) : null,
          fields.notes ? line('Notes', truncate(fields.notes)) : null,
        ]),
      ].join('\n');

    case 'appt.dispositioned':
      return [
        '📍 *Appointment dispositioned*',
        details([
          line('Lead', fields.lead_name),
          line('Disposition', fields.disposition),
          fields.previous ? line('Previous', fields.previous) : null,
          fields.client_name ? line('Client', fields.client_name) : null,
          fields.scheduled_at ? line('Scheduled', fields.scheduled_at) : null,
        ]),
      ].join('\n');

    case 'credit.assigned':
      return [
        '🏅 *Booking credit assigned*',
        details([
          line('Lead', fields.lead_name),
          line('Agent', fields.agent_name ?? '(cleared)'),
          fields.event_type ? line('Event', fields.event_type) : null,
          fields.client_name ? line('Client', fields.client_name) : null,
        ]),
      ].join('\n');

    case 'commitment.logged':
      return [
        '🎯 *Meeting commitment logged*',
        details([
          line('Client', fields.client_name),
          line('Severity', fields.severity),
          line('Owner', fields.owner_role),
          line('Commitment', truncate(fields.commitment ?? '')),
          fields.due_at ? line('Due', fields.due_at) : null,
        ]),
      ].join('\n');

    case 'commitment.updated':
      return [
        '🎯 *Meeting commitment updated*',
        details([
          line('Client', fields.client_name),
          line('Status', fields.status),
          fields.commitment ? line('Commitment', truncate(fields.commitment)) : null,
          fields.resolution_note
            ? line('Resolution', truncate(fields.resolution_note))
            : null,
        ]),
      ].join('\n');

    case 'ops.logged': {
      const rawHeadline = fields.headline?.trim() || 'Activity logged';
      const headline = rawHeadline.includes('*') ? rawHeadline : `📌 *${rawHeadline}*`;
      return [
        headline,
        details([
          line('Action', fields.action),
          line('Item', fields.item),
          line('Client', fields.client_name),
          line('Agent', fields.agent_name),
          line('Lead', fields.lead_name),
          line('Status', fields.status),
          fields.changed_fields ? line('Changed', fields.changed_fields) : null,
          fields.details ? line('Details', truncate(fields.details)) : null,
          fields.note ? line('Note', truncate(fields.note)) : null,
          fields.url ? line('URL', fields.url) : null,
        ]),
      ].join('\n');
    }

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

/** Convenience wrapper for ops.logged (ads, schedule, catalog, library, …). */
export function notifyMrWaizLogged(
  service: SupabaseClient,
  actor: MrWaizActivityActor,
  headline: string,
  fields: Record<string, string | null | undefined> = {},
): Promise<void> {
  return notifyMrWaizActivity(service, {
    eventKey: 'ops.logged',
    actor,
    fields: { headline, ...fields },
  });
}

/**
 * Post to mrwaiz. Never throws. Safe to call without await from routes
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

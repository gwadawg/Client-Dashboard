import type { SupabaseClient } from '@supabase/supabase-js';
import { GHL_ACQUISITION_LOCATION_ID, normalizePhone } from './acquisition-config';
import {
  exportGhlCallMessages,
  listAcquisitionLocationUsers,
  resolveGhlMessageRecordingUrl,
  type GhlCallMessage,
} from './ghl-acquisition-api';
import { normalizeStoredAgentName } from './agent-name-aliases';

const CALL_MESSAGE_TYPES = new Set([
  'TYPE_CALL',
  'TYPE_CAMPAIGN_CALL',
  'TYPE_CAMPAIGN_MANUAL_CALL',
  'TYPE_CUSTOM_CALL',
  'TYPE_IVR_CALL',
]);

export type AcquisitionDialsGhlBackfillOptions = {
  dryRun?: boolean;
  since?: string | null;
  until?: string | null;
  outboundOnly?: boolean;
  withRecordings?: boolean;
  limit?: number | null;
};

export type AcquisitionDialsGhlBackfillReport = {
  dry_run: boolean;
  location_id: string;
  since: string | null;
  until: string | null;
  with_recordings: boolean;
  outbound_only: boolean;
  ghl_users_loaded: number;
  ghl_messages_seen: number;
  call_messages: number;
  skipped_not_call: number;
  skipped_direction: number;
  skipped_date: number;
  skipped_existing: number;
  inserted: number;
  updated: number;
  recordings_resolved: number;
  warnings: string[];
};

type ExistingDial = {
  id: string;
  ghl_contact_id: string | null;
  lead_id: string | null;
  occurred_at: string;
  duration_seconds: number | null;
  outcome: string | null;
  agent_name: string | null;
  recording_url: string | null;
  raw: Record<string, unknown> | null;
};

function parseIsoDate(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function inDateWindow(iso: string, since: string | null | undefined, until: string | null | undefined): boolean {
  const t = parseIsoDate(iso);
  if (t == null) return false;
  if (since && t < Date.parse(`${since}T00:00:00.000Z`)) return false;
  if (until && t > Date.parse(`${until}T23:59:59.999Z`)) return false;
  return true;
}

function isCallMessage(message: GhlCallMessage): boolean {
  const mt = String(message.messageType ?? message.type ?? '').toUpperCase();
  if (CALL_MESSAGE_TYPES.has(mt)) return true;
  if (typeof message.type === 'number' && (message.type === 1 || message.type === 10)) return true;
  return false;
}

function firstHttpUrl(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstHttpUrl(item);
      if (url) return url;
    }
    return null;
  }
  const s = String(value).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return null;
}

function dialPhone(message: GhlCallMessage): string | null {
  const direction = String(message.direction ?? 'outbound').toLowerCase();
  return normalizePhone(direction === 'inbound' ? message.from : message.to ?? message.from);
}

function dialOutcome(message: GhlCallMessage): string | null {
  return message.meta?.callStatus ?? message.meta?.call?.status ?? message.status ?? null;
}

function dialDuration(message: GhlCallMessage): number | null {
  const raw = message.meta?.callDuration ?? message.meta?.call?.duration;
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function resolveDialAgentName(message: GhlCallMessage, usersById: Map<string, string>): string | null {
  const direct = message.userName ?? message.meta?.userName;
  if (direct?.trim()) return normalizeStoredAgentName(direct);
  const userId = message.userId;
  if (userId && usersById.has(userId)) {
    return normalizeStoredAgentName(usersById.get(userId));
  }
  return null;
}

function fingerprint(contactId: string | null | undefined, occurredAt: string, durationSeconds: number | null): string {
  return [contactId ?? '', occurredAt.slice(0, 19), durationSeconds ?? ''].join('|');
}

function indexExistingDials(rows: ExistingDial[]) {
  const byMessageId = new Map<string, ExistingDial>();
  const byFingerprint = new Map<string, ExistingDial>();
  for (const row of rows) {
    const messageId = row.raw?.ghl_message_id;
    if (typeof messageId === 'string') byMessageId.set(messageId, row);
    const fp = fingerprint(row.ghl_contact_id, row.occurred_at, row.duration_seconds);
    if (fp !== '||') byFingerprint.set(fp, row);
  }
  return { byMessageId, byFingerprint };
}

export async function backfillAcquisitionDialsFromGhl(
  service: SupabaseClient,
  options: AcquisitionDialsGhlBackfillOptions = {},
): Promise<AcquisitionDialsGhlBackfillReport> {
  const dryRun = options.dryRun ?? false;
  const since = options.since ?? null;
  const until = options.until ?? null;
  const outboundOnly = options.outboundOnly ?? true;
  const withRecordings = options.withRecordings ?? false;
  const limit = options.limit ?? null;

  const report: AcquisitionDialsGhlBackfillReport = {
    dry_run: dryRun,
    location_id: GHL_ACQUISITION_LOCATION_ID,
    since,
    until,
    with_recordings: withRecordings,
    outbound_only: outboundOnly,
    ghl_users_loaded: 0,
    ghl_messages_seen: 0,
    call_messages: 0,
    skipped_not_call: 0,
    skipped_direction: 0,
    skipped_date: 0,
    skipped_existing: 0,
    inserted: 0,
    updated: 0,
    recordings_resolved: 0,
    warnings: [],
  };

  let usersById = new Map<string, string>();
  try {
    usersById = await listAcquisitionLocationUsers();
    report.ghl_users_loaded = usersById.size;
  } catch (e) {
    report.warnings.push(`users lookup: ${e instanceof Error ? e.message : String(e)}`);
  }

  const [{ data: existingDials, error: dialsError }, { data: leads, error: leadsError }] = await Promise.all([
    service
      .from('acquisition_dials')
      .select('id, ghl_contact_id, lead_id, occurred_at, duration_seconds, outcome, agent_name, recording_url, raw'),
    service.from('acquisition_leads').select('id, ghl_contact_id'),
  ]);
  if (dialsError) throw new Error(dialsError.message);
  if (leadsError) throw new Error(leadsError.message);

  const leadByContact = new Map(
    (leads ?? []).filter((l) => l.ghl_contact_id).map((l) => [l.ghl_contact_id as string, l.id as string]),
  );
  const { byMessageId, byFingerprint } = indexExistingDials((existingDials ?? []) as ExistingDial[]);

  let processed = 0;
  for await (const message of exportGhlCallMessages()) {
    report.ghl_messages_seen++;
    if (limit != null && processed >= limit) break;

    if (!isCallMessage(message)) {
      report.skipped_not_call++;
      continue;
    }
    report.call_messages++;

    const direction = String(message.direction ?? 'outbound').toLowerCase();
    if (outboundOnly && direction !== 'outbound') {
      report.skipped_direction++;
      continue;
    }

    const occurredAt = message.dateAdded;
    if (!occurredAt || !inDateWindow(occurredAt, since, until)) {
      report.skipped_date++;
      continue;
    }

    const contactId = message.contactId;
    if (!contactId) {
      report.warnings.push(`message ${message.id}: missing contactId`);
      continue;
    }

    const durationSeconds = dialDuration(message);
    const agentName = resolveDialAgentName(message, usersById);
    const outcome = dialOutcome(message);
    const fp = fingerprint(contactId, occurredAt, durationSeconds);
    const existing = byMessageId.get(message.id) ?? byFingerprint.get(fp) ?? null;

    let recordingUrl = firstHttpUrl(message.attachments);
    if (!recordingUrl && withRecordings && message.id) {
      try {
        recordingUrl = await resolveGhlMessageRecordingUrl(message.id);
        if (recordingUrl) report.recordings_resolved++;
      } catch (e) {
        report.warnings.push(`recording ${message.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const rawPayload = {
      ghl_message_id: message.id,
      ghl_conversation_id: message.conversationId ?? null,
      ghl_backfill: true,
      direction,
      message_type: message.messageType ?? message.type ?? null,
      user_id: message.userId ?? null,
      source: message.source ?? null,
      ghl: message,
    };

    if (existing) {
      const needsRecording = recordingUrl && !existing.recording_url;
      const needsLead = leadByContact.get(contactId) && !existing.lead_id;
      const needsAgent = agentName && !existing.agent_name;
      const needsDuration = durationSeconds != null && existing.duration_seconds == null;
      const needsOutcome = outcome && !existing.outcome;
      const needsRaw = existing.raw?.ghl_message_id !== message.id;
      if (!needsRecording && !needsLead && !needsAgent && !needsDuration && !needsOutcome && !needsRaw) {
        report.skipped_existing++;
        continue;
      }
      if (!dryRun) {
        const patch: Record<string, unknown> = {};
        if (needsRecording) patch.recording_url = recordingUrl;
        if (needsLead) patch.lead_id = leadByContact.get(contactId);
        if (needsAgent) patch.agent_name = agentName;
        if (needsDuration) patch.duration_seconds = durationSeconds;
        if (needsOutcome) patch.outcome = outcome;
        if (needsRaw) patch.raw = { ...(existing.raw ?? {}), ...rawPayload };
        const { error } = await service.from('acquisition_dials').update(patch).eq('id', existing.id);
        if (error) {
          report.warnings.push(`update ${existing.id}: ${error.message}`);
          continue;
        }
        if (needsAgent) existing.agent_name = agentName;
        if (needsDuration) existing.duration_seconds = durationSeconds;
      }
      report.updated++;
    } else {
      const row = {
        ghl_contact_id: contactId,
        lead_id: leadByContact.get(contactId) ?? null,
        occurred_at: occurredAt,
        phone: dialPhone(message),
        duration_seconds: durationSeconds,
        outcome,
        agent_name: agentName,
        recording_url: recordingUrl,
        raw: rawPayload,
      };
      if (!dryRun) {
        const { data, error } = await service.from('acquisition_dials').insert(row).select('id').single();
        if (error) {
          report.warnings.push(`insert ${message.id}: ${error.message}`);
          continue;
        }
        const inserted = { ...row, id: data.id } as ExistingDial;
        byMessageId.set(message.id, inserted);
        byFingerprint.set(fp, inserted);
      }
      report.inserted++;
    }

    processed++;
  }

  return report;
}

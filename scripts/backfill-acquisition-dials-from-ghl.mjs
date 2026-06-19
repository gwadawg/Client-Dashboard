#!/usr/bin/env node
/**
 * Backfill acquisition_dials from GHL call message history.
 *
 * Uses GET /conversations/messages/export?channel=Call (location-scoped).
 * Recordings are not included in the export payload — pass --with-recordings to
 * resolve HTTPS URLs via the GHL recording endpoint (slow; many calls have none).
 *
 * Requires in .env.local:
 *   GHL_ACQUISITION_API_TOKEN (or GHL_API_TOKEN) with conversations/message.readonly
 *   GHL_ACQUISITION_LOCATION_ID
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/backfill-acquisition-dials-from-ghl.mjs --dry-run
 *   node scripts/backfill-acquisition-dials-from-ghl.mjs --apply
 *   node scripts/backfill-acquisition-dials-from-ghl.mjs --apply --since 2025-01-01
 *   node scripts/backfill-acquisition-dials-from-ghl.mjs --apply --with-recordings --limit 50
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseRequest, fetchAll } from './lib/supabase-rest.mjs';
import { createGhlClient } from './lib/ghl-api.mjs';
import { normalizePhoneE164 } from './lib/acquisition-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = !process.argv.includes('--apply');
const WITH_RECORDINGS = process.argv.includes('--with-recordings');
const ALL_DIRECTIONS = process.argv.includes('--all-directions');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : null;
const sinceIdx = process.argv.indexOf('--since');
const untilIdx = process.argv.indexOf('--until');
const SINCE = sinceIdx >= 0 ? process.argv[sinceIdx + 1] : null;
const UNTIL = untilIdx >= 0 ? process.argv[untilIdx + 1] : null;

const CALL_MESSAGE_TYPES = new Set([
  'TYPE_CALL',
  'TYPE_CAMPAIGN_CALL',
  'TYPE_CAMPAIGN_MANUAL_CALL',
  'TYPE_CUSTOM_CALL',
  'TYPE_IVR_CALL',
]);

function loadEnv() {
  const fromProcess = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GHL_ACQUISITION_API_TOKEN: process.env.GHL_ACQUISITION_API_TOKEN,
    GHL_API_TOKEN: process.env.GHL_API_TOKEN,
    GHL_ACQUISITION_LOCATION_ID: process.env.GHL_ACQUISITION_LOCATION_ID,
  };
  for (const envPath of [
    resolve(ROOT, '.env.local'),
    resolve(dirname(ROOT), 'Repos/call-center-reporting-template - Copy/.env.local'),
  ]) {
    if (!existsSync(envPath)) continue;
    const fileEnv = readFileSync(envPath, 'utf-8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .reduce((acc, line) => {
        const [k, ...v] = line.split('=');
        if (k && v.length) acc[k.trim()] = v.join('=').trim();
        return acc;
      }, {});
    return { ...fromProcess, ...fileEnv };
  }
  return fromProcess;
}

function parseIsoDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function inDateWindow(iso) {
  const t = parseIsoDate(iso);
  if (t == null) return false;
  if (SINCE && t < Date.parse(`${SINCE}T00:00:00.000Z`)) return false;
  if (UNTIL && t > Date.parse(`${UNTIL}T23:59:59.999Z`)) return false;
  return true;
}

function isCallMessage(message) {
  const mt = String(message.messageType ?? message.type ?? '').toUpperCase();
  if (CALL_MESSAGE_TYPES.has(mt)) return true;
  if (typeof message.type === 'number' && (message.type === 1 || message.type === 10)) return true;
  return false;
}

function firstHttpUrl(value) {
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

function dialPhone(message) {
  const direction = String(message.direction ?? 'outbound').toLowerCase();
  return normalizePhoneE164(direction === 'inbound' ? message.from : message.to ?? message.from);
}

function dialOutcome(message) {
  return (
    message.meta?.callStatus ??
    message.meta?.call_status ??
    message.status ??
    null
  );
}

function dialDuration(message) {
  const raw = message.meta?.callDuration ?? message.meta?.call_duration ?? message.meta?.duration;
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function indexExistingDials(rows) {
  const byMessageId = new Map();
  const byFingerprint = new Map();
  for (const row of rows) {
    const messageId = row.raw?.ghl_message_id;
    if (messageId) byMessageId.set(messageId, row);
    const fp = [
      row.ghl_contact_id ?? '',
      row.occurred_at?.slice(0, 19) ?? '',
      row.duration_seconds ?? '',
    ].join('|');
    if (fp !== '||') byFingerprint.set(fp, row);
  }
  return { byMessageId, byFingerprint };
}

function fingerprintFor(message, contactId, occurredAt, durationSeconds) {
  return [contactId ?? '', occurredAt.slice(0, 19), durationSeconds ?? ''].join('|');
}

async function main() {
  const env = loadEnv();
  const token = env.GHL_ACQUISITION_API_TOKEN ?? env.GHL_API_TOKEN;
  const locationId = env.GHL_ACQUISITION_LOCATION_ID ?? 'AcDN4LEPnbiqOCWzG1NH';
  const ghl = createGhlClient(token, { delayMs: WITH_RECORDINGS ? 150 : 80 });

  const report = {
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    location_id: locationId,
    since: SINCE,
    until: UNTIL,
    with_recordings: WITH_RECORDINGS,
    outbound_only: !ALL_DIRECTIONS,
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
    samples: [],
  };

  const scopes = await ghl.checkScopes(locationId);
  if (!scopes.conversations) {
    console.error(
      'GHL token missing conversations/message.readonly scope for export API.',
      scopes.detail.conversations ?? scopes,
    );
    process.exit(1);
  }

  const [existingDials, leads] = await Promise.all([
    fetchAll(
      '/rest/v1/acquisition_dials?select=id,ghl_contact_id,lead_id,occurred_at,duration_seconds,recording_url,raw',
    ),
    fetchAll('/rest/v1/acquisition_leads?select=id,ghl_contact_id'),
  ]);
  const leadByContact = new Map(
    leads.filter((l) => l.ghl_contact_id).map((l) => [l.ghl_contact_id, l.id]),
  );
  const { byMessageId, byFingerprint } = indexExistingDials(existingDials);

  let processed = 0;
  for await (const message of ghl.exportMessages(locationId, { channel: 'Call', pageSize: 100 })) {
    report.ghl_messages_seen++;
    if (LIMIT != null && processed >= LIMIT) break;

    if (!isCallMessage(message)) {
      report.skipped_not_call++;
      continue;
    }
    report.call_messages++;

    const direction = String(message.direction ?? 'outbound').toLowerCase();
    if (!ALL_DIRECTIONS && direction !== 'outbound') {
      report.skipped_direction++;
      continue;
    }

    const occurredAt = message.dateAdded ?? message.date ?? message.createdAt;
    if (!occurredAt || !inDateWindow(occurredAt)) {
      report.skipped_date++;
      continue;
    }

    const contactId = message.contactId ?? message.contact_id;
    if (!contactId) {
      report.warnings.push(`message ${message.id}: missing contactId`);
      continue;
    }

    const durationSeconds = dialDuration(message);
    const fp = fingerprintFor(message, contactId, occurredAt, durationSeconds);
    const existing = byMessageId.get(message.id) ?? byFingerprint.get(fp) ?? null;

    let recordingUrl = firstHttpUrl(message.attachments);
    if (!recordingUrl && WITH_RECORDINGS && message.id) {
      try {
        recordingUrl = await ghl.resolveMessageRecordingUrl(message.id, locationId);
        if (recordingUrl) report.recordings_resolved++;
      } catch (e) {
        report.warnings.push(`recording ${message.id}: ${e.message ?? e}`);
      }
    }

    const row = {
      ghl_contact_id: contactId,
      lead_id: leadByContact.get(contactId) ?? existing?.lead_id ?? null,
      occurred_at: occurredAt,
      phone: dialPhone(message),
      duration_seconds: durationSeconds,
      outcome: dialOutcome(message),
      agent_name: message.userName ?? message.meta?.userName ?? null,
      recording_url: recordingUrl ?? existing?.recording_url ?? null,
      raw: {
        ghl_message_id: message.id,
        ghl_conversation_id: message.conversationId ?? null,
        ghl_backfill: true,
        direction,
        message_type: message.messageType ?? message.type ?? null,
        user_id: message.userId ?? null,
        source: message.source ?? null,
        ghl: message,
      },
    };

    if (existing) {
      const needsRecording = recordingUrl && !existing.recording_url;
      const needsLead = row.lead_id && !existing.lead_id;
      const needsRaw = !existing.raw?.ghl_message_id;
      if (!needsRecording && !needsLead && !needsRaw) {
        report.skipped_existing++;
        continue;
      }
      if (!DRY_RUN) {
        const patch = {};
        if (needsRecording) patch.recording_url = recordingUrl;
        if (needsLead) patch.lead_id = row.lead_id;
        if (needsRaw) patch.raw = { ...(existing.raw ?? {}), ...row.raw };
        const res = await supabaseRequest('PATCH', `/rest/v1/acquisition_dials?id=eq.${existing.id}`, patch);
        if (res.status >= 300) {
          report.warnings.push(`update ${existing.id}: HTTP ${res.status}`);
          continue;
        }
      }
      report.updated++;
      if (report.samples.length < 5) {
        report.samples.push({ action: 'update', message_id: message.id, contact_id: contactId, occurred_at: occurredAt });
      }
    } else {
      if (!DRY_RUN) {
        const res = await supabaseRequest('POST', '/rest/v1/acquisition_dials', row);
        if (res.status >= 300) {
          report.warnings.push(`insert ${message.id}: HTTP ${res.status} ${res.data?.slice?.(0, 200)}`);
          continue;
        }
        const inserted = JSON.parse(res.data)?.[0];
        if (inserted?.id) {
          byMessageId.set(message.id, inserted);
          byFingerprint.set(fp, inserted);
        }
      }
      report.inserted++;
      if (report.samples.length < 5) {
        report.samples.push({ action: 'insert', message_id: message.id, contact_id: contactId, occurred_at: occurredAt });
      }
    }

    processed++;
  }

  const outDir = resolve(ROOT, 'data/import/acquisition');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `ghl-dials-backfill-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

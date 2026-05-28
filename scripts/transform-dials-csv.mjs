/**
 * Waiz **All Dials** CSV → `08_events_dials.csv`
 *
 *   node scripts/transform-dials-csv.mjs "/path/to/All Dials.csv"
 */

import { mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseCsv, writeCsv } from './lib/csv.mjs';
import {
  buildLeadId,
  colIndex,
  emptyEventRow,
  extractGhlContactId,
  EVENT_IMPORT_HEADERS,
  getCell,
  normalizePhone,
  parseDateTimeFlexible,
} from './lib/waiz-import-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');
mkdirSync(OUT_DIR, { recursive: true });

const argvRest = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const INPUT =
  argvRest[0] ??
  resolve(process.env.HOME, 'Downloads/Call Center - Waiz - All Dials.csv');

const raw = readFileSync(INPUT, 'utf-8');
const table = parseCsv(raw);
const headers = table[0].map((h) => h.trim());

const C = {
  subAccount: colIndex(headers, 'Sub Account', 'sub_account', 'Sub-account', 'Sub-Account'),
  leadName: colIndex(headers, 'Lead Name', 'lead_name'),
  leadPhone: colIndex(headers, 'Lead Phone Number', 'lead_phone_number'),
  callTime: colIndex(
    headers,
    'Date Time Of Call',
    'date_time_of_call',
    'Date & Time of Call',
    'Date and Time of Call',
  ),
  direction: colIndex(headers, 'Direction', 'direction'),
  status: colIndex(headers, 'Status', 'status'),
  duration: colIndex(
    headers,
    'Durations Seconds',
    'durations_seconds',
    'Duration Seconds',
    'duration_seconds',
    'Durations (seconds)',
  ),
  agent: colIndex(headers, 'Agent', 'agent'),
  recording: colIndex(headers, 'Recording URL', 'recording_url'),
  summary: colIndex(headers, 'Call Summary', 'call_summary'),
  dialedFrom: colIndex(headers, 'Dialed From', 'dialed_from'),
  link: colIndex(headers, 'Link To Contact', 'LInk To Contact'),
};

const events = [];

for (let r = 1; r < table.length; r++) {
  const row = table[r];
  const get = (i) => getCell(row, i);

  const client_name = get(C.subAccount);
  if (!client_name) continue;

  const occurred_at = parseDateTimeFlexible(get(C.callTime));
  if (!occurred_at) continue;

  const lead_name = get(C.leadName);
  const lead_phone_raw = get(C.leadPhone);
  const lead_phone = normalizePhone(lead_phone_raw) || lead_phone_raw;
  const ghl = extractGhlContactId(get(C.link));
  const lead_id = buildLeadId(client_name, lead_phone_raw, ghl, lead_name, occurred_at);

  const dur = parseInt(get(C.duration), 10);
  const duration_seconds = Number.isFinite(dur) ? dur : 0;
  const st = get(C.status).toLowerCase();
  const completed = st.includes('complete') || st === 'answered';

  const is_pickup = duration_seconds >= 40 ? 'true' : 'false';
  const is_conversation = duration_seconds >= 120 && completed ? 'true' : 'false';

  const ev = emptyEventRow();
  ev.event_type = 'dial';
  ev.client_name = client_name;
  ev.occurred_at = occurred_at;
  ev.ghl_contact_id = ghl || lead_id;
  ev.lead_id = lead_id;
  ev.lead_name = lead_name;
  ev.lead_phone = lead_phone;
  ev.duration_seconds = String(duration_seconds);
  ev.is_pickup = is_pickup;
  ev.is_conversation = is_conversation;
  ev.call_status = get(C.status) || null;
  ev.agent_name = get(C.agent);
  ev.direction = get(C.direction);
  ev.recording_url = get(C.recording);
  ev.call_summary = get(C.summary);
  ev.phone_number_used = get(C.dialedFrom);
  ev.raw_json = JSON.stringify({
    source: 'all_dials',
    status: get(C.status),
  });
  events.push(ev);
}

writeCsv(resolve(OUT_DIR, '08_events_dials.csv'), EVENT_IMPORT_HEADERS, events);
console.log(`Dials rows: ${table.length - 1} → ${events.length} events → ${OUT_DIR}/08_events_dials.csv`);

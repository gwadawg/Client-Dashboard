/**
 * Waiz **LO Audit** tab → `11_events_lo_audit.csv`
 *
 * Internal cadence / process tracking — does **not** affect client KPIs in `metrics.ts`
 * (excluded from lead/appt funnel counts unless you add it later).
 *
 *   node scripts/transform-lo-audit-csv.mjs "/path/to/LO Audit.csv"
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
  parseDateMDY,
  parseDateTimeFlexible,
} from './lib/waiz-import-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');
mkdirSync(OUT_DIR, { recursive: true });

const argvRest = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const INPUT =
  argvRest[0] ?? resolve(process.env.HOME, 'Downloads/Call Center - Waiz - LO Audit.csv');

const raw = readFileSync(INPUT, 'utf-8');
const table = parseCsv(raw);
const headers = table[0].map((h) => h.trim());

/** Every column after the first row → stored in raw_json for flexibility. */
function rowToRawObject(headerRow, dataRow) {
  const o = {};
  for (let i = 0; i < headerRow.length; i++) {
    const key = headerRow[i]?.trim() || `col_${i}`;
    o[key] = (dataRow[i] ?? '').trim();
  }
  return o;
}

const C = {
  date: colIndex(headers, 'Date', 'Audit Date', 'date'),
  project: colIndex(headers, 'Project Name', 'project_name', 'Account', 'Sub Account'),
  leadName: colIndex(headers, 'Lead Name', 'lead_name'),
  phone: colIndex(headers, 'Phone Number', 'Phone', 'lead_phone_number'),
  email: colIndex(headers, 'Email', 'email'),
  link: colIndex(headers, 'Link To Contact', 'LInk To Contact'),
  agent: colIndex(headers, 'Agent', 'LO', 'agent'),
};

const events = [];

for (let r = 1; r < table.length; r++) {
  const row = table[r];
  const get = (i) => getCell(row, i);

  const client_name = get(C.project);
  if (!client_name) continue;

  const occurred_at =
    parseDateTimeFlexible(get(C.date)) ?? parseDateMDY(get(C.date));
  if (!occurred_at) continue;

  const lead_name = get(C.leadName);
  const phone_raw = get(C.phone);
  const lead_email = get(C.email);
  const lead_phone = normalizePhone(phone_raw) || phone_raw;
  const ghl = extractGhlContactId(get(C.link));
  const lead_id = buildLeadId(client_name, phone_raw, ghl, lead_name, occurred_at);

  const rawPayload = rowToRawObject(headers, row);
  rawPayload.source = 'lo_audit';

  const ev = emptyEventRow();
  ev.event_type = 'lo_audit';
  ev.client_name = client_name;
  ev.occurred_at = occurred_at;
  ev.ghl_contact_id = ghl || lead_id;
  ev.lead_id = lead_id;
  ev.lead_name = lead_name;
  ev.lead_phone = lead_phone;
  ev.lead_email = lead_email;
  ev.agent_name = get(C.agent);
  ev.raw_json = JSON.stringify(rawPayload);
  events.push(ev);
}

writeCsv(resolve(OUT_DIR, '11_events_lo_audit.csv'), EVENT_IMPORT_HEADERS, events);
console.log(`LO Audit rows: ${table.length - 1} → ${events.length} events → ${OUT_DIR}/11_events_lo_audit.csv`);

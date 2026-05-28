/**
 * Waiz **Claimed** tab → `10_events_claimed.csv`
 *
 * LO is handling the lead without call center → one **dial** row with **conversation** = true.
 *
 *   node scripts/transform-claimed-csv.mjs "/path/to/Claimed.csv"
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
  argvRest[0] ?? resolve(process.env.HOME, 'Downloads/Call Center - Waiz - Claimed.csv');

const raw = readFileSync(INPUT, 'utf-8');
const table = parseCsv(raw);
const headers = table[0].map((h) => h.trim());

const C = {
  date: colIndex(headers, 'Date', 'Date Claimed', 'Claimed Date', 'date_claimed'),
  account: colIndex(headers, 'Account', 'Project Name', 'project_name', 'Sub Account'),
  leadName: colIndex(headers, 'Lead Name', 'lead_name'),
  phone: colIndex(headers, 'Phone Number', 'Phone', 'number', 'lead_phone_number'),
  email: colIndex(headers, 'Email', 'email'),
  agent: colIndex(headers, 'Agent', 'agent'),
  link: colIndex(headers, 'Link To Contact', 'LInk To Contact'),
};

const events = [];

for (let r = 1; r < table.length; r++) {
  const row = table[r];
  const get = (i) => getCell(row, i);

  const client_name = get(C.account);
  if (!client_name) continue;

  const occurred_at = parseDateTimeFlexible(get(C.date)) ?? parseDateMDY(get(C.date));
  if (!occurred_at) continue;

  const lead_name = get(C.leadName);
  const phone_raw = get(C.phone);
  const lead_email = get(C.email);
  const lead_phone = normalizePhone(phone_raw) || phone_raw;
  const ghl = extractGhlContactId(get(C.link));
  const lead_id = buildLeadId(client_name, phone_raw, ghl, lead_name, occurred_at);

  const ev = emptyEventRow();
  ev.event_type = 'dial';
  ev.client_name = client_name;
  ev.occurred_at = occurred_at;
  ev.ghl_contact_id = ghl || lead_id;
  ev.lead_id = lead_id;
  ev.lead_name = lead_name;
  ev.lead_phone = lead_phone;
  ev.lead_email = lead_email;
  ev.duration_seconds = '120';
  ev.is_pickup = 'true';
  ev.is_conversation = 'true';
  ev.call_status = 'completed';
  ev.agent_name = get(C.agent);
  ev.raw_json = JSON.stringify({ source: 'claimed', note: 'LO-handled; counts as conversation' });
  events.push(ev);
}

writeCsv(resolve(OUT_DIR, '10_events_claimed.csv'), EVENT_IMPORT_HEADERS, events);
console.log(`Claimed rows: ${table.length - 1} → ${events.length} events → ${OUT_DIR}/10_events_claimed.csv`);

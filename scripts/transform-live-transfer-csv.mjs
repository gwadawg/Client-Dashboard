/**
 * Waiz **Live Transfer** tab → `13_events_live_transfer.csv`
 *
 *   node scripts/transform-live-transfer-csv.mjs "/path/to/Live Transfer.csv"
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
  resolve(process.env.HOME, 'Downloads/Call Center - Waiz - Live Transfer.csv');

const raw = readFileSync(INPUT, 'utf-8');
const table = parseCsv(raw);
const headers = table[0].map((h) => h.trim());

const C = {
  date: colIndex(headers, 'Date', 'date'),
  project: colIndex(headers, 'Project Name', 'project_name', 'Account', 'Sub Account', 'Sub-account'),
  leadName: colIndex(headers, 'Lead Name', 'lead_name'),
  phone: colIndex(headers, 'Phone Number', 'Phone number', 'number', 'Phone'),
  agent: colIndex(headers, 'Agent', 'agent'),
  agentNumber: colIndex(headers, 'Agent Number', 'agent_number'),
  link: colIndex(headers, 'Link To Contact', 'LInk To Contact'),
  adSet: colIndex(headers, 'Ad Set Name', 'ad_set_name'),
  adName: colIndex(headers, 'Ad Name', 'ad_name'),
};

const events = [];

for (let r = 1; r < table.length; r++) {
  const row = table[r];
  const get = (i) => getCell(row, i);

  const client_name = get(C.project).trim();
  if (!client_name) continue;

  const occurred_at = parseDateTimeFlexible(get(C.date));
  if (!occurred_at) continue;

  const lead_name = get(C.leadName).trim();
  const phone_raw = get(C.phone);
  const lead_phone = normalizePhone(phone_raw) || phone_raw;
  const ghl = extractGhlContactId(get(C.link));
  const lead_id = buildLeadId(client_name, phone_raw, ghl, lead_name, occurred_at);

  const ev = emptyEventRow();
  ev.event_type = 'live_transfer';
  ev.client_name = client_name;
  ev.occurred_at = occurred_at;
  ev.ghl_contact_id = ghl || lead_id;
  ev.lead_id = lead_id;
  ev.lead_name = lead_name || '';
  ev.lead_phone = lead_phone || '';
  ev.agent_name = get(C.agent);
  ev.phone_number_used = get(C.agentNumber);
  ev.ad_name = get(C.adName);
  ev.ad_set_name = get(C.adSet);
  ev.raw_json = JSON.stringify({
    source: 'live_transfer',
    agent_number: get(C.agentNumber),
  });
  events.push(ev);
}

writeCsv(resolve(OUT_DIR, '13_events_live_transfer.csv'), EVENT_IMPORT_HEADERS, events);
console.log(`Live Transfer rows: ${table.length - 1} → ${events.length} events → ${OUT_DIR}/13_events_live_transfer.csv`);

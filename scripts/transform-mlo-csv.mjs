/**
 * Waiz **MLO Conversions** CSV → `09_events_mlo.csv`
 *
 * proposal_made = offer made; submitted -> submission_made; closed/funded -> loan_funded.
 *
 *   node scripts/transform-mlo-csv.mjs "/path/to/MLO Conversions.csv"
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
  argvRest[0] ??
  resolve(process.env.HOME, 'Downloads/Call Center - Waiz - MLO Conversions.csv');

function parseYn(v) {
  const s = (v ?? '').trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1';
}

const raw = readFileSync(INPUT, 'utf-8');
const table = parseCsv(raw);
const headers = table[0].map((h) => h.trim());

const C = {
  date: colIndex(headers, 'Date', 'date'),
  account: colIndex(headers, 'Account', 'account'),
  leadName: colIndex(headers, 'Lead Name', 'lead_name'),
  number: colIndex(headers, 'Number', 'number', 'Phone Number'),
  email: colIndex(headers, 'Email', 'email'),
  proposal: colIndex(headers, 'Proposal Sent', 'proposal_sent'),
  submitted: colIndex(headers, 'Submitted', 'submitted'),
  closed: colIndex(headers, 'Closed', 'closed'),
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
  const phone_raw = get(C.number);
  const lead_email = get(C.email);
  const lead_phone = normalizePhone(phone_raw) || phone_raw;
  const ghl = extractGhlContactId(get(C.link));
  const lead_id = buildLeadId(client_name, phone_raw, ghl, lead_name, occurred_at);

  const base = {
    client_name,
    occurred_at,
    ghl_contact_id: ghl || lead_id,
    lead_id,
    lead_name,
    lead_phone,
    lead_email,
  };

  const flags = [
    ['proposal_made', parseYn(get(C.proposal))],
    ['submission_made', parseYn(get(C.submitted))],
    ['loan_funded', parseYn(get(C.closed))],
  ];

  for (const [event_type, on] of flags) {
    if (!on) continue;
    const ev = emptyEventRow();
    ev.event_type = event_type;
    Object.assign(ev, base);
    ev.raw_json = JSON.stringify({ source: 'mlo_conversions' });
    events.push(ev);
  }
}

writeCsv(resolve(OUT_DIR, '09_events_mlo.csv'), EVENT_IMPORT_HEADERS, events);
console.log(`MLO rows: ${table.length - 1} → ${events.length} events → ${OUT_DIR}/09_events_mlo.csv`);

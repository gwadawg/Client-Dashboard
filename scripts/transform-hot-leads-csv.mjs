/**
 * Waiz **Hot Leads** tab → `14_events_hot_leads.csv`
 *
 * Each row → one `lead` event with `is_hot: true`.
 *
 * Same double-count caveat as Qualified Leads: avoid importing **New Leads** + this tab
 * for the same contacts/period unless you want duplicate Total Leads.
 *
 *   node scripts/transform-hot-leads-csv.mjs "/path/to/Hot Leads.csv"
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
  argvRest[0] ?? resolve(process.env.HOME, 'Downloads/Call Center - Waiz - Hot Leads.csv');

const raw = readFileSync(INPUT, 'utf-8');
const table = parseCsv(raw);
const headers = table[0].map((h) => h.trim());

const C = {
  date: colIndex(headers, 'Date', 'date', 'Date Created'),
  project: colIndex(
    headers,
    'Project Name',
    'project_name',
    'Account Name',
    'Account',
    'Sub Account',
    'Sub-account',
  ),
  leadName: colIndex(headers, 'Lead Name', 'lead_name'),
  phone: colIndex(
    headers,
    'Phone Number',
    'Phone number',
    'Phone',
    'number',
    'lead_phone_number',
  ),
  email: colIndex(headers, 'Email', 'email'),
  state: colIndex(headers, 'State', 'state'),
  ltv: colIndex(headers, 'LTV', 'ltv'),
  age: colIndex(headers, 'Age', 'age'),
  adSet: colIndex(headers, 'Ad Set Name', 'ad_set_name'),
  adName: colIndex(headers, 'Ad Name', 'ad_name'),
  link: colIndex(headers, 'Link To Contact', 'LInk To Contact'),
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
  const lead_email = get(C.email);
  const lead_phone = normalizePhone(phone_raw) || phone_raw;
  const ghl = extractGhlContactId(get(C.link));
  const lead_id = buildLeadId(client_name, phone_raw, ghl, lead_name, occurred_at);

  const rawPayload = {
    source: 'hot_leads_tab',
    state: get(C.state),
    ltv: get(C.ltv),
    age: get(C.age),
    ad_name: get(C.adName),
    ad_set_name: get(C.adSet),
  };

  const ev = emptyEventRow();
  ev.event_type = 'lead';
  ev.client_name = client_name;
  ev.occurred_at = occurred_at;
  ev.ghl_contact_id = ghl || lead_id;
  ev.lead_id = lead_id;
  ev.lead_name = lead_name || null;
  ev.lead_phone = lead_phone || null;
  ev.lead_email = lead_email || null;
  ev.is_qualified = 'false';
  ev.is_hot = 'true';
  ev.is_out_of_state = 'false';
  ev.ad_name = get(C.adName);
  ev.ad_set_name = get(C.adSet);
  ev.raw_json = JSON.stringify(rawPayload);
  events.push(ev);
}

writeCsv(resolve(OUT_DIR, '14_events_hot_leads.csv'), EVENT_IMPORT_HEADERS, events);
console.log(
  `Hot Leads rows: ${table.length - 1} → ${events.length} lead events → ${OUT_DIR}/14_events_hot_leads.csv`,
);
console.log(
  '(Note: importing both this file and New Leads for the same contacts duplicates Total Leads.)\n',
);

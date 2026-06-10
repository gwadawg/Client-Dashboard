/**
 * Merge **New Leads** + **Qualified Leads** + **Hot Leads** CSVs → one `lead` row per contact.
 *
 * Use when your **New Leads** tab stopped updating but Qualified/Hot tabs have newer history.
 * Do **not** also import `12_events_qualified_leads.csv` / `14_events_hot_leads.csv` (delete them
 * from `data/import/` before `import-historical-events.mjs`) or you will double-count.
 *
 *   node scripts/transform-leads-merged.mjs \
 *     "/path/to/New Leads.csv" \
 *     "/path/to/Qualified Leads.csv" \
 *     "/path/to/Hot Leads.csv"
 *
 * Paths are optional; missing files use defaults under $HOME/Downloads/ (skipped if not found).
 * At least one input file must exist.
 *
 * Optional: `--with-flag-events` — synthetic Appt/Spoken/Offer/Closed only from **New Leads** rows.
 */

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseCsv, writeCsv } from './lib/csv.mjs';
import {
  buildLeadId,
  colIndex,
  extractGhlContactId,
  EVENT_IMPORT_HEADERS,
  getCell,
  normalizePhone,
  parseDateTimeFlexible,
  slugClient,
} from './lib/waiz-import-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');
const home = process.env.HOME;

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const WITH_FLAG_EVENTS = process.argv.includes('--with-flag-events');

const PATH_NEW = argv[0] ?? resolve(home, 'Downloads/Call Center - Waiz - New Leads.csv');
const PATH_QUAL = argv[1] ?? resolve(home, 'Downloads/Call Center - Waiz - Qualified Leads.csv');
const PATH_HOT = argv[2] ?? resolve(home, 'Downloads/Call Center - Waiz - Hot Leads.csv');

const FALLBACK_ISO = new Date('2020-01-01T12:00:00.000Z').toISOString();

/** Dedupe key: GHL id, else phone+client, else client+lowercase name (no date). */
function stableMergeKey(clientName, phoneRaw, linkCell, leadName) {
  const ghl = extractGhlContactId(linkCell);
  if (ghl) return `g:${ghl}`;
  const digits = normalizePhone(phoneRaw);
  if (digits) return `p:${slugClient(clientName)}:${digits}`;
  const n = (leadName ?? '').trim().toLowerCase();
  return `n:${slugClient(clientName)}:${n || '__noname__'}`;
}

function parseYn(val) {
  const v = (val ?? '').trim().toUpperCase();
  if (v === 'Y' || v === 'YES' || v === 'TRUE' || v === '1') return true;
  if (v === 'N' || v === 'NO' || v === 'FALSE' || v === '0') return false;
  return null;
}

function pickEarlier(isoA, isoB) {
  if (!isoA) return isoB;
  if (!isoB) return isoA;
  return new Date(isoA) <= new Date(isoB) ? isoA : isoB;
}

function ingestNewLeads(path, profiles) {
  if (!existsSync(path)) {
    console.warn(`Skip New Leads (not found): ${path}`);
    return 0;
  }
  const table = parseCsv(readFileSync(path, 'utf-8'));
  const headers = table[0].map((h) => h.trim());
  const col = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const IDX = {
    date: col('Date Created'),
    account: col('Account'),
    name: col('Lead Name'),
    phone: col('Phone Number'),
    email: col('Email'),
    qualified: col('Qualified'),
    hot: col('Hot'),
    appt: col('Appt'),
    spoken: col('Spoken'),
    offer: col('Offer'),
    closed: col('Closed'),
    oos: col('Out of State?'),
    ltv: col('LTV'),
    age: col('Age'),
    state: col('State'),
    loan: col('Loan Balance'),
    property: col('Property Value'),
    adName: col('Ad Name'),
    adSet: col('Ad Set Name'),
    link: col('LInk To Contact') >= 0 ? col('LInk To Contact') : col('Link To Contact'),
    timesCalled: col('# of Times Called'),
  };

  let n = 0;
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const get = (i) => (i >= 0 ? (cells[i] ?? '').trim() : '');
    const client_name = get(IDX.account);
    if (!client_name) continue;

    const lead_name = get(IDX.name);
    const lead_phone = get(IDX.phone);
    const link = get(IDX.link);
    const occurred_at = parseDateTimeFlexible(get(IDX.date));
    const mk = stableMergeKey(client_name, lead_phone, link, lead_name);

    if (!profiles.has(mk)) {
      profiles.set(mk, {
        mergeKey: mk,
        client_name,
        lead_name,
        lead_phone_raw: lead_phone,
        lead_email: get(IDX.email),
        link,
        occurred_at: occurred_at ?? null,
        is_qualified: false,
        is_hot: false,
        is_out_of_state: false,
        appt: false,
        spoken: false,
        offer: false,
        closed: false,
        raw: { sources: ['new_leads'] },
      });
    }
    const p = profiles.get(mk);
    p.client_name = client_name;
    if (occurred_at) p.occurred_at = pickEarlier(p.occurred_at, occurred_at);
    if (lead_name && (!p.lead_name || p.lead_name === 'Not Documented')) p.lead_name = lead_name;
    if (get(IDX.email)) p.lead_email = get(IDX.email);
    if (lead_phone) p.lead_phone_raw = lead_phone;
    if (link) p.link = link;
    if (!p.raw.sources.includes('new_leads')) p.raw.sources.push('new_leads');

    const q = parseYn(get(IDX.qualified));
    const h = parseYn(get(IDX.hot));
    const o = parseYn(get(IDX.oos));
    if (q === true) p.is_qualified = true;
    if (h === true) p.is_hot = true;
    if (o === true) p.is_out_of_state = true;
    if (parseYn(get(IDX.appt)) === true) p.appt = true;
    if (parseYn(get(IDX.spoken)) === true) p.spoken = true;
    if (parseYn(get(IDX.offer)) === true) p.offer = true;
    if (parseYn(get(IDX.closed)) === true) p.closed = true;

    Object.assign(p.raw, {
      ltv: get(IDX.ltv),
      age: get(IDX.age),
      state: get(IDX.state),
      loan_balance: get(IDX.loan),
      property_value: get(IDX.property),
      ad_name: get(IDX.adName),
      ad_set_name: get(IDX.adSet),
      times_called: get(IDX.timesCalled),
    });
    n++;
  }
  return n;
}

function ingestQualifiedTab(path, profiles) {
  if (!existsSync(path)) {
    console.warn(`Skip Qualified Leads (not found): ${path}`);
    return 0;
  }
  const table = parseCsv(readFileSync(path, 'utf-8'));
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

  let n = 0;
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const get = (i) => getCell(row, i);
    const client_name = get(C.project).trim();
    if (!client_name) continue;
    const lead_name = get(C.leadName).trim();
    const phone_raw = get(C.phone);
    const link = get(C.link);
    const occurred_at = parseDateTimeFlexible(get(C.date));
    if (!occurred_at) continue;

    const mk = stableMergeKey(client_name, phone_raw, link, lead_name);
    if (!profiles.has(mk)) {
      profiles.set(mk, {
        mergeKey: mk,
        client_name,
        lead_name,
        lead_phone_raw: phone_raw,
        lead_email: get(C.email),
        link,
        occurred_at,
        is_qualified: true,
        is_hot: false,
        is_out_of_state: false,
        appt: false,
        spoken: false,
        offer: false,
        closed: false,
        raw: { sources: ['qualified_tab'] },
      });
    } else {
      const p = profiles.get(mk);
      p.is_qualified = true;
      p.occurred_at = pickEarlier(p.occurred_at, occurred_at);
      if (lead_name && (!p.lead_name || p.lead_name === 'Not Documented')) p.lead_name = lead_name;
      if (get(C.email)) p.lead_email = get(C.email);
      if (phone_raw) p.lead_phone_raw = phone_raw;
      if (link) p.link = link;
      if (!p.raw.sources.includes('qualified_tab')) p.raw.sources.push('qualified_tab');
      Object.assign(p.raw, {
        qualified_state: get(C.state),
        qualified_ltv: get(C.ltv),
        qualified_age: get(C.age),
        qualified_ad_name: get(C.adName),
        qualified_ad_set_name: get(C.adSet),
      });
    }
    n++;
  }
  return n;
}

function ingestHotTab(path, profiles) {
  if (!existsSync(path)) {
    console.warn(`Skip Hot Leads (not found): ${path}`);
    return 0;
  }
  const table = parseCsv(readFileSync(path, 'utf-8'));
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

  let n = 0;
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const get = (i) => getCell(row, i);
    const client_name = get(C.project).trim();
    if (!client_name) continue;
    const lead_name = get(C.leadName).trim();
    const phone_raw = get(C.phone);
    const link = get(C.link);
    const occurred_at = parseDateTimeFlexible(get(C.date));
    if (!occurred_at) continue;

    const mk = stableMergeKey(client_name, phone_raw, link, lead_name);
    if (!profiles.has(mk)) {
      profiles.set(mk, {
        mergeKey: mk,
        client_name,
        lead_name,
        lead_phone_raw: phone_raw,
        lead_email: get(C.email),
        link,
        occurred_at,
        is_qualified: false,
        is_hot: true,
        is_out_of_state: false,
        appt: false,
        spoken: false,
        offer: false,
        closed: false,
        raw: { sources: ['hot_tab'] },
      });
    } else {
      const p = profiles.get(mk);
      p.is_hot = true;
      p.occurred_at = pickEarlier(p.occurred_at, occurred_at);
      if (lead_name && (!p.lead_name || p.lead_name === 'Not Documented')) p.lead_name = lead_name;
      if (get(C.email)) p.lead_email = get(C.email);
      if (phone_raw) p.lead_phone_raw = phone_raw;
      if (link) p.link = link;
      if (!p.raw.sources.includes('hot_tab')) p.raw.sources.push('hot_tab');
      Object.assign(p.raw, {
        hot_state: get(C.state),
        hot_ltv: get(C.ltv),
        hot_age: get(C.age),
        hot_ad_name: get(C.adName),
        hot_ad_set_name: get(C.adSet),
      });
    }
    n++;
  }
  return n;
}

// ── run ──────────────────────────────────────────────────────────────────────

const profiles = new Map();
const nNew = ingestNewLeads(PATH_NEW, profiles);
const nQual = ingestQualifiedTab(PATH_QUAL, profiles);
const nHot = ingestHotTab(PATH_HOT, profiles);

if (!profiles.size) {
  console.error('No rows merged — check that at least one CSV exists and has data.');
  process.exit(1);
}

/** Finalize: lead_id from earliest occurred_at + identity */
const finalized = [];
for (const p of profiles.values()) {
  const occurred_at = p.occurred_at ?? FALLBACK_ISO;
  const ghl = extractGhlContactId(p.link);
  const lead_id = buildLeadId(p.client_name, p.lead_phone_raw, ghl, p.lead_name, occurred_at);
  const lead_phone = normalizePhone(p.lead_phone_raw) || p.lead_phone_raw;
  finalized.push({
    ...p,
    occurred_at,
    lead_id,
    ghl_contact_id: ghl || lead_id,
    lead_phone,
  });
}

mkdirSync(OUT_DIR, { recursive: true });

const registryRows = finalized.map((p) => ({
  lead_id: p.lead_id,
  ghl_contact_id: p.ghl_contact_id,
  client_name: p.client_name,
  lead_name: p.lead_name,
  lead_phone: p.lead_phone,
  lead_email: p.lead_email,
  first_seen_at: p.occurred_at,
}));

const leadEvents = finalized.map((p) => ({
  event_type: 'lead',
  client_name: p.client_name,
  occurred_at: p.occurred_at,
  ghl_contact_id: p.ghl_contact_id,
  lead_id: p.lead_id,
  lead_name: p.lead_name,
  lead_phone: p.lead_phone,
  lead_email: p.lead_email,
  is_qualified: p.is_qualified ? 'true' : 'false',
  is_hot: p.is_hot ? 'true' : 'false',
  is_out_of_state: p.is_out_of_state ? 'true' : 'false',
  ad_name: p.raw.ad_name ?? p.raw.qualified_ad_name ?? p.raw.hot_ad_name ?? '',
  ad_set_name: p.raw.ad_set_name ?? p.raw.qualified_ad_set_name ?? p.raw.hot_ad_set_name ?? '',
  raw_json: JSON.stringify(p.raw),
}));

const conversionEvents = [];
if (WITH_FLAG_EVENTS) {
  for (const p of finalized) {
    const base = {
      client_name: p.client_name,
      occurred_at: p.occurred_at,
      ghl_contact_id: p.ghl_contact_id,
      lead_id: p.lead_id,
      lead_name: p.lead_name,
      lead_phone: p.lead_phone,
      lead_email: p.lead_email,
    };
    if (p.appt) conversionEvents.push({ ...base, event_type: 'appointment_booked' });
    if (p.spoken) {
      conversionEvents.push({
        ...base,
        event_type: 'dial',
        duration_seconds: '120',
        is_pickup: 'true',
        is_conversation: 'true',
        call_status: 'completed',
      });
    }
    if (p.offer) conversionEvents.push({ ...base, event_type: 'proposal_sent' });
    if (p.closed) conversionEvents.push({ ...base, event_type: 'loan_funded' });
  }
}

writeCsv(
  resolve(OUT_DIR, '02_lead_registry.csv'),
  ['lead_id', 'ghl_contact_id', 'client_name', 'lead_name', 'lead_phone', 'lead_email', 'first_seen_at'],
  registryRows,
);
writeCsv(
  resolve(OUT_DIR, '03_events_leads.csv'),
  [
    'event_type',
    'client_name',
    'occurred_at',
    'ghl_contact_id',
    'lead_id',
    'lead_name',
    'lead_phone',
    'lead_email',
    'is_qualified',
    'is_hot',
    'is_out_of_state',
    'ad_name',
    'ad_set_name',
    'raw_json',
  ],
  leadEvents,
);
writeCsv(
  resolve(OUT_DIR, '04_events_conversions_from_flags.csv'),
  [
    'event_type',
    'client_name',
    'occurred_at',
    'ghl_contact_id',
    'lead_id',
    'lead_name',
    'lead_phone',
    'lead_email',
    'duration_seconds',
    'is_pickup',
    'is_conversation',
    'call_status',
  ],
  conversionEvents,
);

const leadRowsFor05 = leadEvents.map((ev) => ({
  ...ev,
  duration_seconds: '',
  is_pickup: '',
  is_conversation: '',
  call_status: '',
}));
const allEvents = [...leadRowsFor05, ...conversionEvents];
writeCsv(resolve(OUT_DIR, '05_events_all_combined.csv'), EVENT_IMPORT_HEADERS, allEvents);

console.log(
  `Merged leads: New Leads rows=${nNew}, Qualified rows=${nQual}, Hot rows=${nHot} → ${finalized.length} unique contacts`,
);
console.log(`Lead events: ${leadEvents.length}; flag conversions: ${conversionEvents.length}`);
console.log(`\nWrote ${OUT_DIR}/05_events_all_combined.csv`);
console.log(
  '\n→ Remove data/import/12_events_qualified_leads.csv and 14_events_hot_leads.csv before import-historical-events if present.\n',
);

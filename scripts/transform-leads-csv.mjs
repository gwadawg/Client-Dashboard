/**
 * Transform Waiz "New Leads" sheet CSV → Supabase-ready import files.
 *
 * Usage:
 *   node scripts/transform-leads-csv.mjs "/path/to/Call Center - Waiz - New Leads.csv"
 *
 * Outputs: data/import/
 */

import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');

const INPUT = process.argv[2] ?? resolve(process.env.HOME, 'Downloads/Call Center - Waiz - New Leads.csv');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      i += c === '\r' ? 2 : 1;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

function normalizePhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}

function slugClient(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function extractGhlContactId(url) {
  if (!url) return '';
  const m = url.match(/\/contacts\/detail\/([^/?#\s]+)/i);
  return m?.[1]?.trim() ?? '';
}

function parseYn(val) {
  const v = (val ?? '').trim().toUpperCase();
  if (v === 'Y' || v === 'YES' || v === 'TRUE' || v === '1') return true;
  if (v === 'N' || v === 'NO' || v === 'FALSE' || v === '0') return false;
  return null;
}

function parseDateMDY(str) {
  const s = (str ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function hashSlug(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

/** Stable lead_id: scoped per client; GHL id when available. */
function buildLeadId(clientName, phone, ghlContactId, leadName, occurredAt) {
  if (ghlContactId) return ghlContactId;
  const digits = normalizePhone(phone);
  const client = slugClient(clientName);
  if (digits) return `ldr:${client}:${digits}`;
  const name = (leadName ?? '').trim().toLowerCase();
  const date = (occurredAt ?? '').slice(0, 10);
  const basis = `${client}|${name}|${date}`;
  return `ldr:${client}:nophone:${hashSlug(basis)}`;
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(path, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(','));
  }
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const raw = readFileSync(INPUT, 'utf-8');
const table = parseCsv(raw);
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

const profiles = new Map();
let skipped = 0;

for (let r = 1; r < table.length; r++) {
  const cells = table[r];
  const get = (i) => (i >= 0 ? (cells[i] ?? '').trim() : '');

  const client_name = get(IDX.account);
  const lead_name = get(IDX.name);
  const lead_phone = get(IDX.phone);
  const lead_email = get(IDX.email);
  const occurred_at = parseDateMDY(get(IDX.date));

  if (!client_name) {
    skipped++;
    continue;
  }

  const ghl_from_url = extractGhlContactId(get(IDX.link));
  const lead_id = buildLeadId(client_name, lead_phone, ghl_from_url, lead_name, occurred_at);

  const rowFlags = {
    is_qualified: parseYn(get(IDX.qualified)),
    is_hot: parseYn(get(IDX.hot)),
    is_out_of_state: parseYn(get(IDX.oos)),
    appt: parseYn(get(IDX.appt)),
    spoken: parseYn(get(IDX.spoken)),
    offer: parseYn(get(IDX.offer)),
    closed: parseYn(get(IDX.closed)),
  };

  const rawPayload = {
    ltv: get(IDX.ltv),
    age: get(IDX.age),
    state: get(IDX.state),
    loan_balance: get(IDX.loan),
    property_value: get(IDX.property),
    ad_name: get(IDX.adName),
    ad_set_name: get(IDX.adSet),
    times_called: get(IDX.timesCalled),
  };

  if (!profiles.has(lead_id)) {
    profiles.set(lead_id, {
      lead_id,
      client_name,
      lead_name,
      lead_phone: normalizePhone(lead_phone) || lead_phone,
      lead_email,
      occurred_at: occurred_at ?? new Date('2024-01-01T12:00:00.000Z').toISOString(),
      ghl_contact_id: ghl_from_url || lead_id,
      is_qualified: false,
      is_hot: false,
      is_out_of_state: false,
      appt: false,
      spoken: false,
      offer: false,
      closed: false,
      raw: rawPayload,
    });
  }

  const p = profiles.get(lead_id);
  if (occurred_at && new Date(occurred_at) < new Date(p.occurred_at)) {
    p.occurred_at = occurred_at;
    if (lead_name) p.lead_name = lead_name;
    if (lead_email) p.lead_email = lead_email;
    if (lead_phone) p.lead_phone = normalizePhone(lead_phone) || lead_phone;
  }
  if (lead_name && (!p.lead_name || p.lead_name === 'Not Documented')) p.lead_name = lead_name;
  if (lead_email && !p.lead_email) p.lead_email = lead_email;
  if (ghl_from_url) p.ghl_contact_id = ghl_from_url;

  for (const k of ['is_qualified', 'is_hot', 'is_out_of_state', 'appt', 'spoken', 'offer', 'closed']) {
    if (rowFlags[k] === true) p[k] = true;
  }
}

mkdirSync(OUT_DIR, { recursive: true });

const registryRows = [...profiles.values()].map((p) => ({
  lead_id: p.lead_id,
  ghl_contact_id: p.ghl_contact_id,
  client_name: p.client_name,
  lead_name: p.lead_name,
  lead_phone: p.lead_phone,
  lead_email: p.lead_email,
  first_seen_at: p.occurred_at,
}));

const leadEvents = [...profiles.values()].map((p) => ({
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
  ad_name: p.raw.ad_name,
  ad_set_name: p.raw.ad_set_name,
  raw_json: JSON.stringify(p.raw),
}));

const conversionEvents = [];
for (const p of profiles.values()) {
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
  if (p.closed) conversionEvents.push({ ...base, event_type: 'closed' });
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

const allEvents = [...leadEvents, ...conversionEvents];
writeCsv(
  resolve(OUT_DIR, '05_events_all_combined.csv'),
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
    'duration_seconds',
    'is_pickup',
    'is_conversation',
    'call_status',
    'ad_name',
    'ad_set_name',
    'raw_json',
  ],
  allEvents,
);

console.log(`Input rows:     ${table.length - 1}`);
console.log(`Skipped:        ${skipped} (no client name)`);
console.log(`Unique leads:   ${profiles.size}`);
console.log(`Client names:   ${new Set([...profiles.values()].map((p) => p.client_name)).size} (see 01_clients.csv from transform-clients.mjs)`);
console.log(`Lead events:    ${leadEvents.length}`);
console.log(`Conversion evt: ${conversionEvents.length}`);
console.log(`\nWrote files to: ${OUT_DIR}/`);

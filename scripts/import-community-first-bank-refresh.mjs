/**
 * Refresh-safe import for Community First National Bank.
 *
 *   node scripts/transform-community-first-bank-csv.mjs "/path/to/export.csv"
 *   node scripts/import-community-first-bank-refresh.mjs "/path/to/export.csv"
 *   node scripts/import-community-first-bank-refresh.mjs "/path/to/export.csv" --dry-run
 *
 * Emits per row:
 *   - lead (identity touch)
 *   - submission_made | loan_funded | proposal_made from Status
 *
 * Dedupe (this client only): phone → email → first+last name + event_type + date + LO.
 */
import { readFileSync } from 'fs';
import https from 'https';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { COMMUNITY_FIRST_CLIENT_NAME, compactSpace, dedupeKey } from './lib/community-first-dedupe.mjs';
import { normalizePhone } from './lib/waiz-import-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = process.argv.find((a) => a.endsWith('.csv')) ?? '/Users/gwadawg/Desktop/export-13-131689-0.csv';
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 200;
const CLIENT_NAME = COMMUNITY_FIRST_CLIENT_NAME;
const DEDUPE_EVENT_TYPES = ['lead', 'proposal_made', 'submission_made', 'loan_funded'];

const envPath = resolve(__dirname, '../.env.local');
const envVars = readFileSync(envPath, 'utf-8')
  .split('\n')
  .filter((line) => line && !line.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...val] = line.split('=');
    if (key && val.length) acc[key.trim()] = val.join('=').trim();
    return acc;
  }, {});

const SUPABASE_URL = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const SUPABASE_HOST = new URL(SUPABASE_URL).hostname;
const SUPABASE_IP = '104.18.38.10';

function request(method, path, body, extraHeaders = {}) {
  return new Promise((resolveReq, rejectReq) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: SUPABASE_IP,
        servername: SUPABASE_HOST,
        path,
        method,
        headers: {
          host: SUPABASE_HOST,
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolveReq({ status: res.statusCode, data }));
      },
    );
    req.on('error', rejectReq);
    if (payload) req.write(payload);
    req.end();
  });
}

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
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
      row = [];
      i += c === '\r' ? 2 : 1;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
  }
  return rows;
}

function parseDateTimeFlexible(str) {
  const s = (str ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  let hour = 12;
  let minute = 0;
  let second = 0;
  if (m[4] !== undefined) {
    hour = Number(m[4]);
    minute = Number(m[5] ?? 0);
    second = Number(m[6] ?? 0);
    const ap = (m[7] ?? '').toUpperCase();
    if (ap === 'PM' && hour < 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
  }
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function statusToEventType(statusRaw) {
  const s = compactSpace(statusRaw).toLowerCase();
  if (s === 'funded') return 'loan_funded';
  if (s === 'processing' || s === 'submitted' || s === 'submits') return 'submission_made';
  if (s === 'proposed' || s === 'proposal' || s === 'offer') return 'proposal_made';
  return null;
}

async function ensureClientId() {
  const encoded = encodeURIComponent(CLIENT_NAME);
  const { status, data } = await request('GET', `/rest/v1/clients?select=id,name&name=eq.${encoded}`);
  if (status !== 200) throw new Error(`clients lookup failed: ${status} ${data}`);
  const list = JSON.parse(data);
  if (list.length) return list[0].id;
  if (DRY_RUN) return 'dry-client-id';
  const create = await request(
    'POST',
    '/rest/v1/clients?on_conflict=name',
    { name: CLIENT_NAME, is_live: true, reporting_type: 'RM' },
    { Prefer: 'resolution=merge-duplicates,return=representation' },
  );
  if (create.status !== 200 && create.status !== 201) {
    throw new Error(`clients create failed: ${create.status} ${create.data}`);
  }
  const created = JSON.parse(create.data);
  return (Array.isArray(created) ? created[0] : created).id;
}

async function loadExistingKeys(clientId) {
  const types = DEDUPE_EVENT_TYPES.map((t) => `event_type.eq.${t}`).join(',');
  const path = `/rest/v1/events?select=client_id,event_type,occurred_at,lead_phone,lead_email,lead_name,agent_name,raw&client_id=eq.${clientId}&or=(${types})&limit=100000`;
  const { status, data } = await request('GET', path);
  if (status !== 200) throw new Error(`existing events fetch failed: ${status} ${data}`);
  const set = new Set();
  for (const row of JSON.parse(data)) {
    const k = dedupeKey(row);
    if (k) set.add(k);
  }
  return set;
}

function baseRow(clientId, table, r) {
  const headers = table[0].map((h) => compactSpace(h));
  const index = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const IDX = {
    firstName: index('First Name'),
    lastName: index('Last Name'),
    source: index('Source'),
    status: index('Status'),
    loName: index('Loan Officer User Name'),
    createdDate: index('Created Date'),
    mobile: index('Mobile Phone'),
  };
  const row = table[r];
  const get = (i) => (i >= 0 ? compactSpace(row[i] ?? '') : '');
  const first = get(IDX.firstName);
  const last = get(IDX.lastName);
  const lead_name = compactSpace(`${first} ${last}`);
  const occurred_at = parseDateTimeFlexible(get(IDX.createdDate));
  if (!occurred_at) return null;
  const raw = {
    source: get(IDX.source),
    status: get(IDX.status),
    created_date: get(IDX.createdDate),
    first_name: first,
    last_name: last,
    mobile_phone_raw: get(IDX.mobile),
    import_tag: 'community_first_refresh',
  };
  return {
    client_id: clientId,
    occurred_at,
    lead_name: lead_name || null,
    lead_phone: normalizePhone(get(IDX.mobile)) || null,
    lead_email: null,
    agent_name: compactSpace(get(IDX.loName)) || null,
    raw,
  };
}

function toEventsFromCsv(clientId, table) {
  const out = [];
  for (let r = 1; r < table.length; r++) {
    const base = baseRow(clientId, table, r);
    if (!base) continue;

    out.push({ ...base, event_type: 'lead' });

    const statusType = statusToEventType(base.raw.status);
    if (statusType) out.push({ ...base, event_type: statusType });
  }
  return out;
}

async function insertBatch(events) {
  if (!events.length || DRY_RUN) return;
  const { status, data } = await request('POST', '/rest/v1/events', events, { Prefer: 'return=minimal' });
  if (status !== 201) throw new Error(`insert failed ${status}: ${data}`);
}

function filterWithDedupe(candidateEvents, existingKeys) {
  const seenThisRun = new Set();
  const toInsert = [];
  let noIdentityPassThrough = 0;
  let skippedDup = 0;
  const byType = Object.fromEntries(DEDUPE_EVENT_TYPES.map((t) => [t, 0]));

  for (const ev of candidateEvents) {
    if (byType[ev.event_type] !== undefined) byType[ev.event_type]++;
    const k = dedupeKey(ev);
    if (!k) {
      noIdentityPassThrough++;
      toInsert.push(ev);
      continue;
    }
    if (existingKeys.has(k) || seenThisRun.has(k)) {
      skippedDup++;
      continue;
    }
    seenThisRun.add(k);
    toInsert.push(ev);
  }

  return { toInsert, noIdentityPassThrough, skippedDup, byType };
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN: Community First refresh import\n' : 'Community First refresh import\n');
  const csvRaw = readFileSync(INPUT, 'utf-8');
  const table = parseCsv(csvRaw);
  if (!table.length) throw new Error('CSV empty');

  const clientId = await ensureClientId();
  const existingKeys = await loadExistingKeys(clientId);
  const candidateEvents = toEventsFromCsv(clientId, table);
  const { toInsert, noIdentityPassThrough, skippedDup, byType } = filterWithDedupe(
    candidateEvents,
    existingKeys,
  );

  for (let i = 0; i < toInsert.length; i += BATCH) {
    await insertBatch(toInsert.slice(i, i + BATCH));
  }

  console.log(`Client: ${CLIENT_NAME}`);
  console.log(`Input rows: ${table.length - 1}`);
  console.log(`Candidate events: ${candidateEvents.length} (leads ${byType.lead ?? 0}, KPI ${(byType.submission_made ?? 0) + (byType.loan_funded ?? 0) + (byType.proposal_made ?? 0)})`);
  console.log(`Skipped duplicates: ${skippedDup}`);
  console.log(`No phone/email/name pass-through: ${noIdentityPassThrough}`);
  console.log(`Inserted: ${DRY_RUN ? 0 : toInsert.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

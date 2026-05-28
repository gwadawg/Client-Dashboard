/**
 * Transform Community First National Bank KPI CSV into import CSVs.
 *
 * Usage:
 *   node scripts/transform-community-first-bank-csv.mjs "/Users/gwadawg/Desktop/export-13-131689-0.csv"
 *
 * Outputs:
 *   data/import/03_events_community_first_leads.csv
 *   data/import/04_events_community_first_conversions.csv
 *   data/import/05_events_community_first_all_combined.csv
 */
import { mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseCsv, writeCsv } from './lib/csv.mjs';
import { COMMUNITY_FIRST_CLIENT_NAME, compactSpace, identityKeyFromParts } from './lib/community-first-dedupe.mjs';
import { EVENT_IMPORT_HEADERS, normalizePhone, parseDateTimeFlexible } from './lib/waiz-import-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');
const INPUT = process.argv[2] ?? '/Users/gwadawg/Desktop/export-13-131689-0.csv';
const CLIENT_NAME = COMMUNITY_FIRST_CLIENT_NAME;

function statusToEventType(statusRaw) {
  const s = compactSpace(statusRaw).toLowerCase();
  if (s === 'funded') return 'loan_funded';
  if (s === 'processing' || s === 'submitted' || s === 'submits') return 'submission_made';
  if (s === 'proposed' || s === 'proposal' || s === 'offer') return 'proposal_made';
  return '';
}


function transform(table) {
  const headers = table[0].map((h) => compactSpace(h));
  const col = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const IDX = {
    firstName: col('First Name'),
    lastName: col('Last Name'),
    source: col('Source'),
    status: col('Status'),
    loName: col('Loan Officer User Name'),
    createdDate: col('Created Date'),
    mobile: col('Mobile Phone'),
  };

  const byLeadKey = new Map();
  const convByKey = new Map();
  let skippedUnknownStatus = 0;
  let skippedBadDate = 0;

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const get = (i) => (i >= 0 ? compactSpace(row[i] ?? '') : '');
    const first = get(IDX.firstName);
    const last = get(IDX.lastName);
    const fullName = compactSpace(`${first} ${last}`);
    const phoneRaw = get(IDX.mobile);
    const phone = normalizePhone(phoneRaw) || phoneRaw;
    const occurredAt = parseDateTimeFlexible(get(IDX.createdDate));
    const lo = compactSpace(get(IDX.loName));
    const source = get(IDX.source);
    const status = get(IDX.status);
    const eventType = statusToEventType(status);

    if (!occurredAt) {
      skippedBadDate++;
      continue;
    }
    if (!eventType) {
      skippedUnknownStatus++;
      continue;
    }

    const idKey =
      identityKeyFromParts({
        lead_phone: phone,
        lead_email: '',
        lead_name: fullName,
        first_name: first,
        last_name: last,
      }) || `row:${r}`;

    // Lead event dedupe key (one lead touch per identity+day+agent)
    const leadKey = `${CLIENT_NAME}|lead|${idKey}|${occurredAt.slice(0, 10)}|${lo.toLowerCase()}`;
    if (!byLeadKey.has(leadKey)) {
      byLeadKey.set(leadKey, {
        event_type: 'lead',
        client_name: CLIENT_NAME,
        occurred_at: occurredAt,
        lead_name: fullName || null,
        lead_phone: phone || null,
        lead_email: '',
        agent_name: lo || '',
        raw_json: JSON.stringify({
          source,
          status,
          created_date: get(IDX.createdDate),
          first_name: first,
          last_name: last,
          mobile_phone_raw: phoneRaw,
          import_tag: 'community_first_refresh',
        }),
      });
    }

    // KPI conversion event dedupe key (stacked stage events preserved)
    const convKey = `${CLIENT_NAME}|${eventType}|${idKey}|${occurredAt.slice(0, 10)}|${lo.toLowerCase()}`;
    if (!convByKey.has(convKey)) {
      convByKey.set(convKey, {
        event_type: eventType,
        client_name: CLIENT_NAME,
        occurred_at: occurredAt,
        lead_name: fullName || null,
        lead_phone: phone || null,
        lead_email: '',
        agent_name: lo || '',
        raw_json: JSON.stringify({
          source,
          status,
          created_date: get(IDX.createdDate),
          first_name: first,
          last_name: last,
          mobile_phone_raw: phoneRaw,
          import_tag: 'community_first_refresh',
        }),
      });
    }
  }

  return {
    leadEvents: [...byLeadKey.values()],
    conversionEvents: [...convByKey.values()],
    skippedUnknownStatus,
    skippedBadDate,
  };
}

function rowForHeaders(row) {
  const out = Object.fromEntries(EVENT_IMPORT_HEADERS.map((h) => [h, '']));
  for (const [k, v] of Object.entries(row)) {
    if (k in out) out[k] = v ?? '';
  }
  return out;
}

function main() {
  const text = readFileSync(INPUT, 'utf-8');
  const table = parseCsv(text);
  if (!table.length) throw new Error('CSV is empty.');

  const { leadEvents, conversionEvents, skippedUnknownStatus, skippedBadDate } = transform(table);
  const allEvents = [...leadEvents, ...conversionEvents].map(rowForHeaders);

  mkdirSync(OUT_DIR, { recursive: true });
  writeCsv(resolve(OUT_DIR, '03_events_community_first_leads.csv'), EVENT_IMPORT_HEADERS, leadEvents.map(rowForHeaders));
  writeCsv(
    resolve(OUT_DIR, '04_events_community_first_conversions.csv'),
    EVENT_IMPORT_HEADERS,
    conversionEvents.map(rowForHeaders),
  );
  writeCsv(resolve(OUT_DIR, '05_events_community_first_all_combined.csv'), EVENT_IMPORT_HEADERS, allEvents);

  console.log(`Input rows: ${table.length - 1}`);
  console.log(`Lead events: ${leadEvents.length}`);
  console.log(`Conversion events: ${conversionEvents.length}`);
  console.log(`Combined events: ${allEvents.length}`);
  console.log(`Skipped (bad date): ${skippedBadDate}`);
  console.log(`Skipped (unknown status): ${skippedUnknownStatus}`);
  console.log(`Wrote files to: ${OUT_DIR}`);
}

main();

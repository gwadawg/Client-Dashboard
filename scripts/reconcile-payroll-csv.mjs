/**
 * Reconcile May 2026 payroll spreadsheets against Supabase events.
 *
 *   node scripts/reconcile-payroll-csv.mjs
 *   node scripts/reconcile-payroll-csv.mjs "/path/luka.csv" "/path/bernardo.csv"
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  formatReportText,
  loadBernardoRows,
  loadLukaRows,
  PAY_PERIOD,
  reconcileRow,
  summarizeResults,
} from './lib/payroll-backfill.mjs';
import { extractGhlContactId, isTruncatedContactId } from './lib/waiz-import-helpers.mjs';
import { fetchAll } from './lib/supabase-rest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');
mkdirSync(OUT_DIR, { recursive: true });

const home = process.env.HOME ?? '';
const DEFAULT_LUKA = resolve(home, 'Downloads/Bernardo_Luka_May_Appointments - Luka May.csv');
const DEFAULT_BERN = resolve(home, 'Downloads/Bernardo_Luka_May_Appointments - Bernardo May.csv');

const lukaPath = process.argv[2] ?? DEFAULT_LUKA;
const bernPath = process.argv[3] ?? DEFAULT_BERN;

async function fetchEventsByContactIds(contactIds) {
  const map = new Map();
  const chunkSize = 40;
  for (let i = 0; i < contactIds.length; i += chunkSize) {
    const chunk = contactIds.slice(i, i + chunkSize);
    const filter = chunk.map((id) => encodeURIComponent(id)).join(',');
    const path =
      `/rest/v1/events?select=id,event_type,agent_name,occurred_at,scheduled_at,ghl_contact_id,raw,clients(name)` +
      `&ghl_contact_id=in.(${filter})`;
    const rows = await fetchAll(path);
    for (const row of rows) {
      const key = row.ghl_contact_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  return map;
}

async function main() {
  console.log('Loading spreadsheets…');
  const sheetRows = [...loadLukaRows(lukaPath), ...loadBernardoRows(bernPath)];
  console.log(`  ${sheetRows.length} rows (${lukaPath}, ${bernPath})`);

  const contactIds = [
    ...new Set(
      sheetRows
        .map((r) => extractGhlContactId(r.link))
        .filter((id) => id && !isTruncatedContactId(id)),
    ),
  ];
  console.log(`Fetching events for ${contactIds.length} contact IDs…`);
  const eventsByContact = await fetchEventsByContactIds(contactIds);

  const results = sheetRows.map((row) => reconcileRow(row, eventsByContact));
  const counts = summarizeResults(results);
  const reportText = formatReportText(results, counts);

  const payload = {
    period: PAY_PERIOD,
    generated_at: new Date().toISOString(),
    inputs: { luka: lukaPath, bernardo: bernPath },
    counts,
    rows: results,
  };

  const jsonPath = resolve(OUT_DIR, 'payroll-reconcile-may2026.json');
  const txtPath = resolve(OUT_DIR, 'payroll-reconcile-may2026.txt');
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeFileSync(txtPath, reportText);

  console.log('\n' + reportText);
  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${txtPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

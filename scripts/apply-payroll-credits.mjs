/**
 * Apply May 2026 payroll credits: UPDATE agent_name + INSERT missing events.
 *
 *   node scripts/apply-payroll-credits.mjs              # dry-run
 *   node scripts/apply-payroll-credits.mjs --apply      # write to Supabase
 *   node scripts/apply-payroll-credits.mjs --apply "/path/luka.csv" "/path/bernardo.csv"
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { writeCsv } from './lib/csv.mjs';
import {
  buildInsertRow,
  loadBernardoRows,
  loadLukaRows,
  reconcileRow,
  summarizeResults,
} from './lib/payroll-backfill.mjs';
import { EVENT_IMPORT_HEADERS } from './lib/waiz-import-helpers.mjs';
import { extractGhlContactId, isTruncatedContactId } from './lib/waiz-import-helpers.mjs';
import { fetchAll, supabaseRequest } from './lib/supabase-rest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');
const APPLY = process.argv.includes('--apply');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const home = process.env.HOME ?? '';
const DEFAULT_LUKA = resolve(home, 'Downloads/Bernardo_Luka_May_Appointments - Luka May.csv');
const DEFAULT_BERN = resolve(home, 'Downloads/Bernardo_Luka_May_Appointments - Bernardo May.csv');
const lukaPath = args[0] ?? DEFAULT_LUKA;
const bernPath = args[1] ?? DEFAULT_BERN;

const BATCH = 100;

async function loadClients() {
  const rows = await fetchAll('/rest/v1/clients?select=id,name');
  const map = new Map();
  for (const c of rows) map.set(c.name.trim(), c.id);
  return map;
}

async function fetchEventsByContactIds(contactIds) {
  const map = new Map();
  for (let i = 0; i < contactIds.length; i += 40) {
    const chunk = contactIds.slice(i, i + 40);
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

function rowToEvent(csvRow, clientMap) {
  const client_id = clientMap.get(csvRow.client_name?.trim());
  if (!client_id) return null;
  let raw = {};
  if (csvRow.raw_json?.trim()) {
    try {
      raw = JSON.parse(csvRow.raw_json);
    } catch {
      raw = { source: 'payroll_backfill' };
    }
  }
  return {
    client_id,
    event_type: csvRow.event_type,
    occurred_at: csvRow.occurred_at,
    ghl_contact_id: csvRow.ghl_contact_id || null,
    lead_name: csvRow.lead_name || null,
    lead_phone: csvRow.lead_phone || null,
    agent_name: csvRow.agent_name || null,
    scheduled_at: csvRow.scheduled_at?.trim() || null,
    raw,
  };
}

async function patchAgent(eventId, agentName) {
  const { status, data } = await supabaseRequest('PATCH', `/rest/v1/events?id=eq.${eventId}`, {
    agent_name: agentName,
  });
  if (status !== 200) throw new Error(`PATCH event ${eventId}: ${status} ${data}`);
}

async function insertEvents(events) {
  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH);
    const { status, data } = await supabaseRequest('POST', '/rest/v1/events', batch);
    if (status !== 201) throw new Error(`INSERT events: ${status} ${data}`);
  }
}

async function main() {
  console.log(APPLY ? 'APPLY MODE — writing to Supabase\n' : 'DRY RUN — no database writes\n');

  const sheetRows = [...loadLukaRows(lukaPath), ...loadBernardoRows(bernPath)];
  const contactIds = [
    ...new Set(
      sheetRows
        .map((r) => extractGhlContactId(r.link))
        .filter((id) => id && !isTruncatedContactId(id)),
    ),
  ];

  const eventsByContact = await fetchEventsByContactIds(contactIds);
  const results = sheetRows.map((row) => reconcileRow(row, eventsByContact));
  const counts = summarizeResults(results);

  const credits = [];
  const inserts = [];

  for (const r of results) {
    for (const a of r.actions) {
      if (a.action === 'credit_agent') {
        credits.push({ event_id: a.event_id, rep: r.rep, event_type: a.event_type, name: r.name });
      }
      if (a.action === 'insert_event') {
        const csvRow = buildInsertRow(r, { ...a, client_name: r.client_name });
        inserts.push(csvRow);
      }
    }
  }

  console.log('Planned updates (credit_agent):', credits.length);
  console.log('Planned inserts:', inserts.length);
  console.log('Summary:', counts);

  writeCsv(resolve(OUT_DIR, 'payroll-backfill-events.csv'), EVENT_IMPORT_HEADERS, inserts);
  writeFileSync(
    resolve(OUT_DIR, 'payroll-apply-log.json'),
    JSON.stringify({ credits, insert_count: inserts.length, counts }, null, 2),
  );

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write changes.');
    return;
  }

  const clientMap = await loadClients();
  let patched = 0;
  for (const c of credits) {
    await patchAgent(c.event_id, c.rep);
    patched++;
    if (patched % 25 === 0) process.stdout.write(`\r  Patched ${patched}/${credits.length}…`);
  }
  console.log(`\nPatched ${patched} events with agent credit.`);

  const toInsert = [];
  let skipped = 0;
  for (const row of inserts) {
    const ev = rowToEvent(row, clientMap);
    if (!ev) {
      skipped++;
      console.warn(`  Skip insert — unknown client: ${row.client_name} (${row.lead_name})`);
      continue;
    }
    toInsert.push(ev);
  }

  if (toInsert.length) {
    await insertEvents(toInsert);
    console.log(`Inserted ${toInsert.length} events (${skipped} skipped).`);
  } else {
    console.log('No events to insert.');
  }

  console.log('\nDone. Re-run reconcile-payroll-csv.mjs to verify.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

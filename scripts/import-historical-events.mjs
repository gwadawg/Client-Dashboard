/**
 * Import transformed CSV events into Supabase.
 * Run transform-leads-csv.mjs first.
 *
 *   node scripts/import-historical-events.mjs
 *   node scripts/import-historical-events.mjs --dry-run
 *   node scripts/import-historical-events.mjs ./data/import/custom.csv
 */

import { createReadStream, existsSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = resolve(__dirname, '../data/import');
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 200;

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
  return new Promise((resolve, reject) => {
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
          Prefer: 'return=representation',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, data }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      out.push(field);
      field = '';
      continue;
    }
    field += c;
  }
  out.push(field);
  return out;
}

async function readCsv(filePath) {
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let headers = null;
  const rows = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!headers) {
      headers = cells;
      continue;
    }
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function parseBool(s) {
  return s === 'true' || s === 'Y';
}

async function loadClients() {
  const { status, data } = await request('GET', '/rest/v1/clients?select=id,name');
  if (status !== 200) throw new Error(`clients fetch failed: ${data}`);
  const map = new Map();
  for (const c of JSON.parse(data)) map.set(c.name.trim(), c.id);
  return map;
}

async function upsertClient(row, clientMap) {
  const name = row.name?.trim();
  if (!name) return;

  const body = {
    name,
    is_live: row.is_live === 'true',
    ...(row.ghl_location_id?.trim() ? { ghl_location_id: row.ghl_location_id.trim() } : {}),
  };

  if (DRY_RUN) {
    clientMap.set(name, clientMap.get(name) ?? `dry-${name}`);
    return;
  }

  const { status, data } = await request(
    'POST',
    '/rest/v1/clients?on_conflict=name',
    body,
    { Prefer: 'resolution=merge-duplicates,return=representation' },
  );

  if (status === 200 || status === 201) {
    const created = JSON.parse(data);
    const c = Array.isArray(created) ? created[0] : created;
    clientMap.set(name, c.id);
  } else {
    console.warn(`  client "${name}" upsert: ${status}`, data);
    const refetch = await loadClients();
    if (refetch.has(name)) clientMap.set(name, refetch.get(name));
  }
}

function parseRawJson(row) {
  const fallback = { lead_id: row.lead_id, ad_name: row.ad_name, ad_set_name: row.ad_set_name };
  if (!row.raw_json?.trim()) return fallback;
  try {
    return JSON.parse(row.raw_json);
  } catch {
    return { ...fallback, raw_json_invalid: true };
  }
}

function normalizeEventType(eventType) {
  if (eventType === 'proposal_sent') return 'proposal_made';
  if (eventType === 'loan_processing') return 'submission_made';
  if (eventType === 'closed') return 'loan_funded';
  return eventType;
}

function rowToEvent(row, clientMap) {
  const client_id = clientMap.get(row.client_name?.trim());
  if (!client_id) return null;

  const speed = row.speed_to_lead_seconds?.trim();
  const scheduled = row.scheduled_at?.trim();

  const event = {
    client_id,
    event_type: normalizeEventType(row.event_type),
    occurred_at: row.occurred_at,
    ghl_contact_id: row.ghl_contact_id || row.lead_id || null,
    lead_name: row.lead_name || null,
    lead_phone: row.lead_phone || null,
    lead_email: row.lead_email || null,
    is_qualified: row.is_qualified ? parseBool(row.is_qualified) : null,
    is_hot: row.is_hot ? parseBool(row.is_hot) : null,
    is_out_of_state: row.is_out_of_state ? parseBool(row.is_out_of_state) : null,
    duration_seconds: row.duration_seconds ? Number(row.duration_seconds) : null,
    is_pickup: row.is_pickup ? parseBool(row.is_pickup) : null,
    is_conversation: row.is_conversation ? parseBool(row.is_conversation) : null,
    call_status: row.call_status || null,
    speed_to_lead_seconds: speed ? Number(speed) : null,
    direction: row.direction?.trim() || null,
    recording_url: row.recording_url?.trim() || null,
    call_summary: row.call_summary?.trim() || null,
    phone_number_used: row.phone_number_used?.trim() || null,
    scheduled_at: scheduled || null,
    external_id: row.external_id?.trim() || null,
    calendar_name: row.calendar_name?.trim() || null,
    stage_booked: row.stage_booked?.trim() || null,
    agent_name: row.agent_name?.trim() || null,
    raw: parseRawJson(row),
  };

  if (event.event_type !== 'lead') {
    event.is_qualified = null;
    event.is_hot = null;
    event.is_out_of_state = null;
  }

  return event;
}

async function insertBatch(batch) {
  if (!batch.length) return;
  if (DRY_RUN) return;
  const { status, data } = await request('POST', '/rest/v1/events', batch);
  if (status !== 201) throw new Error(`events insert ${status}: ${data}`);
}

/** Default import bundle: leads + optional tab outputs (if files exist). */
const DEFAULT_EVENT_FILES = [
  '05_events_all_combined.csv',
  '07_events_appts.csv',
  '08_events_dials.csv',
  '09_events_mlo.csv',
  '10_events_claimed.csv',
  '11_events_lo_audit.csv',
  '12_events_qualified_leads.csv',
  '13_events_live_transfer.csv',
  '14_events_hot_leads.csv',
];

async function main() {
  const argFiles = process.argv.slice(2).filter((a) => a !== '--dry-run' && !a.startsWith('--'));
  const clientsPath = resolve(IMPORT_DIR, '01_clients.csv');

  console.log(DRY_RUN ? 'DRY RUN\n' : 'Importing historical events…\n');

  const eventPaths =
    argFiles.length > 0
      ? argFiles.map((p) => resolve(p))
      : DEFAULT_EVENT_FILES.map((f) => resolve(IMPORT_DIR, f)).filter((p) => existsSync(p));

  if (!eventPaths.length) {
    console.error(
      'No event CSVs found. Run transform scripts first or pass file paths:\n  node scripts/import-historical-events.mjs ./data/import/05_events_all_combined.csv',
    );
    process.exit(1);
  }

  console.log('Event files:', eventPaths.map((p) => p.replace(IMPORT_DIR + '/', '')).join(', '));

  const clientRows = await readCsv(clientsPath);
  let eventRows = [];
  for (const p of eventPaths) {
    const part = await readCsv(p);
    eventRows = eventRows.concat(part);
  }

  const clientMap = await loadClients();
  console.log(`Upserting ${clientRows.length} clients…`);
  for (const row of clientRows) {
    await upsertClient(row, clientMap);
  }

  let batch = [];
  let inserted = 0;
  let skipped = 0;

  for (const row of eventRows) {
    const event = rowToEvent(row, clientMap);
    if (!event) {
      skipped++;
      continue;
    }
    batch.push(event);
    if (batch.length >= BATCH) {
      await insertBatch(batch);
      inserted += batch.length;
      process.stdout.write(`\r  ${inserted} events…`);
      batch = [];
    }
  }
  await insertBatch(batch);
  inserted += batch.length;

  console.log(`\nDone. Inserted: ${inserted}, skipped (no client): ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

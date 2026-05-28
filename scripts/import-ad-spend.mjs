/**
 * Import `15_ad_spend_meta.csv` (or paths you pass) into Supabase `ad_spend`.
 * Run after `import-clients.mjs` so `client_name` resolves.
 *
 *   node scripts/transform-facebook-data-csv.mjs "/path/to/Facebook Data.csv"
 *   node scripts/import-ad-spend.mjs --dry-run
 *   node scripts/import-ad-spend.mjs
 */

import { createReadStream, existsSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = resolve(__dirname, '../data/import');
const DRY_RUN = process.argv.includes('--dry-run');
const REPLACE_META = process.argv.includes('--replace-meta');
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
  return new Promise((resolvePromise, reject) => {
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
        res.on('end', () => resolvePromise({ status: res.statusCode, data }));
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

async function loadClients() {
  const { status, data } = await request('GET', '/rest/v1/clients?select=id,name');
  if (status !== 200) throw new Error(`clients fetch failed: ${data}`);
  const map = new Map();
  for (const c of JSON.parse(data)) map.set(c.name.trim(), c.id);
  return map;
}

async function deleteAllMetaSpend() {
  if (DRY_RUN) {
    console.log('DRY RUN: would delete all ad_spend rows where platform=meta');
    return;
  }
  const { status, data } = await request('DELETE', '/rest/v1/ad_spend?platform=eq.meta');
  if (status !== 204 && status !== 200) {
    throw new Error(`ad_spend delete ${status}: ${data}`);
  }
  console.log('Deleted existing Meta ad_spend rows.');
}

async function upsertBatch(batch) {
  if (!batch.length) return;
  if (DRY_RUN) return;
  const { status, data } = await request(
    'POST',
    '/rest/v1/ad_spend?on_conflict=client_id,spend_date,platform',
    batch,
    {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
  );
  if (status !== 201 && status !== 200) throw new Error(`ad_spend upsert ${status}: ${data}`);
}

async function main() {
  const argFiles = process.argv.slice(2).filter((a) => a !== '--dry-run' && !a.startsWith('--'));
  const paths =
    argFiles.length > 0
      ? argFiles.map((p) => resolve(p))
      : [resolve(IMPORT_DIR, '15_ad_spend_meta.csv')].filter((p) => existsSync(p));

  if (!paths.length) {
    console.error(
      'No ad spend CSV found. Run:\n  node scripts/transform-facebook-data-csv.mjs "/path/to/Facebook Data.csv"',
    );
    process.exit(1);
  }

  console.log(DRY_RUN ? 'DRY RUN\n' : 'Importing ad spend…\n');
  console.log('Files:', paths.map((p) => p.replace(IMPORT_DIR + '/', '')).join(', '));
  if (REPLACE_META) console.log('Mode: replace all Meta spend (delete meta rows, then import)\n');

  if (REPLACE_META) await deleteAllMetaSpend();

  const clientMap = await loadClients();
  let batch = [];
  let inserted = 0;
  let skipped = 0;

  for (const filePath of paths) {
    const rows = await readCsv(filePath);
    for (const row of rows) {
      const name = row.client_name?.trim();
      const client_id = name ? clientMap.get(name) : null;
      if (!client_id) {
        skipped++;
        continue;
      }
      const platform = (row.platform || 'meta').trim();
      const spend_date = row.spend_date?.trim();
      const amount = Number(row.amount);
      if (!spend_date || !Number.isFinite(amount)) {
        skipped++;
        continue;
      }
      batch.push({ client_id, spend_date, platform, amount });
      if (batch.length >= BATCH) {
        await upsertBatch(batch);
        inserted += batch.length;
        process.stdout.write(`\r  ${inserted} rows…`);
        batch = [];
      }
    }
  }

  await upsertBatch(batch);
  inserted += batch.length;

  console.log(`\nDone. Upserted: ${inserted}, skipped (no client or bad row): ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

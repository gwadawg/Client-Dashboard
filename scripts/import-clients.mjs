/**
 * Upsert clients from data/import/01_clients.csv
 *
 *   node scripts/import-clients.mjs
 *   node scripts/import-clients.mjs --dry-run
 */

import { readFileSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '../data/import/01_clients.csv');
const DRY_RUN = process.argv.includes('--dry-run');

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

async function main() {
  const rows = await readCsv(CSV_PATH);
  console.log(DRY_RUN ? 'DRY RUN — clients\n' : 'Importing clients…\n');

  let upserted = 0;
  let failed = 0;

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) continue;

    const body = {
      name,
      is_live: row.is_live === 'true',
      ...(row.ghl_location_id?.trim()
        ? { ghl_location_id: row.ghl_location_id.trim() }
        : {}),
    };

    if (DRY_RUN) {
      console.log(`  would upsert: ${name} (live=${body.is_live})`);
      upserted++;
      continue;
    }

    const { status, data } = await request(
      'POST',
      '/rest/v1/clients?on_conflict=name',
      body,
      { Prefer: 'resolution=merge-duplicates,return=representation' },
    );

    if (status === 200 || status === 201) {
      upserted++;
    } else {
      failed++;
      console.warn(`  failed "${name}": ${status}`, data);
    }
  }

  console.log(`\nDone. Upserted: ${upserted}, failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

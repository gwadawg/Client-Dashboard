/**
 * Validate the Meta client map before wiring Make.
 *
 *   node scripts/validate-meta-client-map.mjs data/import/meta-client-map.csv.example
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { parseCsv } from './lib/csv.mjs';

const DEFAULT_MAP = 'data/import/meta-client-map.csv.example';
const inputPath = resolve(process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? DEFAULT_MAP);
const envPath = resolve('.env.local');

function loadEnv() {
  if (!existsSync(envPath)) {
    throw new Error('Missing .env.local. Add Supabase credentials before validating client names.');
  }

  return readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .reduce((acc, line) => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) acc[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
      return acc;
    }, {});
}

function rowsFromCsv(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Client map not found: ${filePath}`);
  }

  const table = parseCsv(readFileSync(filePath, 'utf-8'));
  if (table.length < 2) return [];

  const headers = table[0].map((h) => h.trim());
  return table.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, (row[index] ?? '').trim()])),
  );
}

function isActive(row) {
  const value = String(row.is_active ?? 'true').trim().toLowerCase();
  return !['false', '0', 'no', 'n', 'inactive'].includes(value);
}

function normalizeAccountId(value) {
  return String(value ?? '').trim().replace(/^act_/, '');
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  }

  const rows = rowsFromCsv(inputPath);
  const activeRows = rows.filter(isActive);
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: clients, error } = await supabase.from('clients').select('name').order('name');

  if (error) throw error;

  const clientNames = new Set((clients ?? []).map((client) => client.name));
  const missingClients = [];
  const missingAdAccounts = [];
  const duplicateNames = new Set();
  const seenNames = new Set();

  for (const row of activeRows) {
    const clientName = row.client_name?.trim();
    const accountId = normalizeAccountId(row.meta_ad_account_id);

    if (!clientName || !clientNames.has(clientName)) missingClients.push(clientName || '(blank)');
    if (!accountId || !/^\d+$/.test(accountId)) missingAdAccounts.push(clientName || '(blank)');
    if (seenNames.has(clientName)) duplicateNames.add(clientName);
    seenNames.add(clientName);
  }

  console.log(`Rows checked: ${activeRows.length} active / ${rows.length} total`);
  console.log(`Dashboard clients found: ${clientNames.size}`);

  if (missingClients.length) {
    console.log('\nClient names missing from dashboard:');
    for (const name of missingClients) console.log(`- ${name}`);
  }

  if (missingAdAccounts.length) {
    console.log('\nRows with missing or invalid Meta ad account IDs:');
    for (const name of missingAdAccounts) console.log(`- ${name}`);
  }

  if (duplicateNames.size) {
    console.log('\nDuplicate active client rows:');
    for (const name of duplicateNames) console.log(`- ${name}`);
  }

  if (missingClients.length || missingAdAccounts.length || duplicateNames.size) {
    process.exitCode = 1;
    return;
  }

  console.log('\nMeta client map is ready for Make.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

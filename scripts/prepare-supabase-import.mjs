/**
 * Regenerate all Supabase import CSVs from source files in Downloads.
 *
 *   node scripts/prepare-supabase-import.mjs
 */

import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const home = process.env.HOME;

const LEADS = `${home}/Downloads/Call Center - Waiz - New Leads.csv`;
const PROJECT = `${home}/Downloads/Call Center - Waiz - Project Info.csv`;

function run(script, args) {
  const res = spawnSync('node', [resolve(__dirname, script), ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

console.log('=== 1/2 Project Info + Clients ===\n');
run('transform-clients.mjs', [PROJECT, LEADS]);

console.log('\n=== 2/2 Leads + Events ===\n');
run('transform-leads-csv.mjs', [LEADS]);

console.log('\nAll import files ready in data/import/');
console.log('Next: node scripts/import-clients.mjs && node scripts/import-historical-events.mjs');

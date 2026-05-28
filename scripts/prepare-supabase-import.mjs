/**
 * Regenerate all Supabase import CSVs from source files in Downloads.
 *
 *   node scripts/prepare-supabase-import.mjs
 */

import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const home = process.env.HOME;

const LEADS = `${home}/Downloads/Call Center - Waiz - New Leads.csv`;
const PROJECT = `${home}/Downloads/Call Center - Waiz - Project Info.csv`;

const OPTIONAL_TRANSFORMS = [
  ['transform-appts-csv.mjs', `${home}/Downloads/Call Center - Waiz - Appt1.csv`],
  ['transform-dials-csv.mjs', `${home}/Downloads/Call Center - Waiz - All Dials.csv`],
  ['transform-mlo-csv.mjs', `${home}/Downloads/Call Center - Waiz - MLO Conversions.csv`],
  ['transform-claimed-csv.mjs', `${home}/Downloads/Call Center - Waiz - Claimed.csv`],
  ['transform-lo-audit-csv.mjs', `${home}/Downloads/Call Center - Waiz - LO Audit.csv`],
  ['transform-qualified-leads-csv.mjs', `${home}/Downloads/Call Center - Waiz - Qualified Leads.csv`],
  ['transform-live-transfer-csv.mjs', `${home}/Downloads/Call Center - Waiz - Live Transfer.csv`],
  ['transform-hot-leads-csv.mjs', `${home}/Downloads/Call Center - Waiz - Hot Leads.csv`],
  ['transform-facebook-data-csv.mjs', `${home}/Downloads/Call Center - Waiz - Facebook Data.csv`],
];

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

console.log('\n=== Optional tab transforms (skip if CSV missing) ===\n');
for (const [script, csvPath] of OPTIONAL_TRANSFORMS) {
  if (existsSync(csvPath)) {
    console.log(`Running ${script} ← ${csvPath}`);
    run(script, [csvPath]);
  } else {
    console.log(`Skip ${script} (no file: ${csvPath})`);
  }
}

console.log('\nAll import files ready in data/import/');
console.log('Next: node scripts/import-clients.mjs && node scripts/import-historical-events.mjs && node scripts/import-ad-spend.mjs');

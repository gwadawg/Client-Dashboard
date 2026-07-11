#!/usr/bin/env node
/**
 * Import labeled expense CSV into Mr. Waiz (via local API or direct Supabase).
 *
 * Usage:
 *   node scripts/import-expenses.mjs path/to/charges.csv           # dry-run via API
 *   node scripts/import-expenses.mjs path/to/charges.csv --apply  # write
 *   node scripts/import-expenses.mjs path/to/charges.csv --apply --rollup
 *
 * Env:
 *   EXPENSE_IMPORT_URL  default http://localhost:3000/api/expenses/import
 *   EXPENSE_ROLLUP_URL  default http://localhost:3000/api/expenses/rollup
 *   EXPENSE_COOKIE      optional session cookie for auth (or run while logged in via curl -b)
 *
 * Prefer the Expenses UI Import for interactive use. This script is for year backfill.
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const apply = args.includes('--apply');
const doRollup = args.includes('--rollup');

if (!file) {
  console.error('Usage: node scripts/import-expenses.mjs <csv> [--apply] [--rollup]');
  process.exit(1);
}

const abs = path.resolve(file);
if (!fs.existsSync(abs)) {
  console.error('File not found:', abs);
  process.exit(1);
}

const csv = fs.readFileSync(abs, 'utf8');
const importUrl = process.env.EXPENSE_IMPORT_URL || 'http://localhost:3000/api/expenses/import';
const rollupUrl = process.env.EXPENSE_ROLLUP_URL || 'http://localhost:3000/api/expenses/rollup';
const cookie = process.env.EXPENSE_COOKIE || '';

const headers = { 'Content-Type': 'application/json' };
if (cookie) headers.Cookie = cookie;

const res = await fetch(importUrl, {
  method: 'POST',
  headers,
  body: JSON.stringify({ csv, dryRun: !apply, apply_rules: true }),
});
const data = await res.json();
if (!res.ok) {
  console.error('Import failed:', data);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));

if (apply && doRollup) {
  // Collect YYYY-MM from sample / assume current year months present in file
  const months = new Set();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const m = line.match(/(\d{4})-(\d{2})-\d{2}/) || line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      if (m[0].includes('-')) months.add(`${m[1]}-${m[2]}`);
      else months.add(`${m[3]}-${String(m[1]).padStart(2, '0')}`);
    }
  }
  const list = [...months].sort();
  if (list.length) {
    const r = await fetch(rollupUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ months: list }),
    });
    const rd = await r.json();
    console.log('Rollup:', JSON.stringify(rd, null, 2));
  }
}

console.log(apply ? 'Done (applied).' : 'Dry-run only. Re-run with --apply to write.');

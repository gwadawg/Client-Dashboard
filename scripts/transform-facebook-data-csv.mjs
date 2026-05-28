/**
 * Waiz **Facebook Data** export → `15_ad_spend_meta.csv`
 *
 * Aggregates **Amount spent** per client per **Date** (same client + day → summed).
 * Platform is always **meta** for this tab.
 *
 *   node scripts/transform-facebook-data-csv.mjs "/path/to/Facebook Data.csv"
 */

import { mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseCsv, writeCsv } from './lib/csv.mjs';
import { colIndex, getCell, parseDateTimeFlexible } from './lib/waiz-import-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/import');
mkdirSync(OUT_DIR, { recursive: true });

const argvRest = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const INPUT =
  argvRest[0] ?? resolve(process.env.HOME, 'Downloads/Call Center - Waiz - Facebook Data.csv');

function parseMoney(s) {
  const t = (s ?? '').replace(/[$,\s]/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Supports dashed and slash dates (Meta CSVs vary by export). */
function spendDateOnly(str) {
  const iso = parseDateTimeFlexible((str ?? '').trim());
  if (!iso) return null;
  return iso.slice(0, 10);
}

const raw = readFileSync(INPUT, 'utf-8');
const table = parseCsv(raw);
const headers = table[0].map((h) => h.trim());

const C = {
  date: colIndex(headers, 'Date', 'date', 'Day'),
  project: colIndex(
    headers,
    'Project Name',
    'project_name',
    'Account',
    'Account Name',
    'Sub Account',
    'Sub-account',
  ),
  amount: colIndex(headers, 'Amount spent', 'Amount Spent', 'amount_spent', 'Spend', 'Amount'),
};

const totals = new Map();

for (let r = 1; r < table.length; r++) {
  const row = table[r];
  const get = (i) => getCell(row, i);

  const client_name = get(C.project).trim();
  if (!client_name) continue;

  const spend_date = spendDateOnly(get(C.date));
  if (!spend_date) continue;

  const amt = parseMoney(get(C.amount));
  if (amt == null || amt < 0) continue;

  const key = `${client_name}\0${spend_date}`;
  totals.set(key, (totals.get(key) ?? 0) + amt);
}

const outRows = [...totals.entries()]
  .map(([key, amount]) => {
    const [client_name, spend_date] = key.split('\0');
    return {
      client_name,
      spend_date,
      platform: 'meta',
      amount: String(Math.round(amount * 100) / 100),
    };
  })
  .sort((a, b) => a.client_name.localeCompare(b.client_name) || a.spend_date.localeCompare(b.spend_date));

writeCsv(resolve(OUT_DIR, '15_ad_spend_meta.csv'), ['client_name', 'spend_date', 'platform', 'amount'], outRows);

const rawRows = Math.max(0, table.length - 1);
console.log(
  `Facebook Data rows: ${rawRows} → ${outRows.length} ad_spend rows (meta, by client+day) → ${OUT_DIR}/15_ad_spend_meta.csv`,
);

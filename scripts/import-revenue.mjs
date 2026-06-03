/**
 * One-off historical revenue import.
 *
 * Parses "WM _ Company Report - Revenue.csv" and emits a single SQL file that:
 *   1. removes any prior rows from this import (idempotent re-run)
 *   2. creates the confirmed-missing clients as churned historical records
 *   3. inserts one client_billings row per payment, bucketed by Type:
 *        MRR / PIF  -> base_amount (retainer)         amount = Collected
 *        Performance -> performance_amount             amount = Collected
 *        Passthrough -> passthrough_amount, amount = 0 (excluded from revenue)
 *
 *   node scripts/import-revenue.mjs "/path/to/Revenue.csv" > scripts/out/revenue-import.sql
 *
 * A summary is printed to stderr so the SQL on stdout stays clean.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseCsv } from './lib/csv.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CSV_PATH =
  process.argv[2] || '/Users/gwadawg/Desktop/WM _ Company Report - Revenue.csv';

// Sheet client name -> existing roster client name (matched on lower(name)).
const NAME_MAP = {
  'Douglas Cavanah': 'Douglas Cavanaugh',
  RJ: 'RJ Hartnett',
  'Anthony Usher': 'Tony Usher',
  'Amir S': 'Amir Abuhalimeh',
  'Bryan Ashby': "Bryan Ashby's office",
};

// Confirmed: create these (no roster match) as churned historical clients.
const CREATE_CLIENTS = new Set([
  'Joe Webb',
  'Henry Depieri',
  'Perry Pappas',
  'Tony Gaglione',
  'Brad Donovan',
  'Dave Bartel',
  'Steve Bentler',
  'Timothy Gray',
  'Patrick O Connel',
  'Toby English',
  'Micah Greenberg',
  'Laura Strickler',
]);

const REVENUE_TYPES = new Set(['mrr', 'pif', 'performance', 'passthrough']);

const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;
const numOrNull = (v) => (v == null || Number.isNaN(v) ? 'null' : String(v));

function parseAmount(value) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toYmd(value) {
  const s = (value ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const [, m, d, yRaw] = mdy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

const table = parseCsv(readFileSync(CSV_PATH, 'utf-8'));
const headers = table[0].map((h) => h.trim());
const idx = (name) => headers.indexOf(name);
const col = {
  date: idx('Date'),
  id: idx('ID'),
  client: idx('Client'),
  source: idx('Source'),
  collected: idx('Collected'),
  fee: idx('Fee'),
  term: idx('Term'),
  type: idx('Type'),
  febe: idx('FE . BE'),
};

const valuesRows = [];
const sourceByCreatedClient = new Map();
const perClient = new Map();
let skipped = 0;
let passthroughCount = 0;
let passthroughTotal = 0;
let revenueTotal = 0;

for (let r = 1; r < table.length; r++) {
  const cells = table[r];
  const get = (i) => (i >= 0 ? (cells[i] ?? '').trim() : '');

  const rawName = get(col.client);
  const rawId = get(col.id);
  if (!rawName || rawName === '#N/A') {
    skipped++;
    continue;
  }
  const date = toYmd(get(col.date));
  const collected = parseAmount(get(col.collected));
  if (!date || collected == null) {
    skipped++;
    continue;
  }

  // Resolve client: alphanumeric id -> ClickUp task id; else name (mapped).
  let matchKind, matchKey;
  if (rawId && /[a-z]/i.test(rawId)) {
    matchKind = 'clickup';
    matchKey = rawId;
  } else {
    matchKind = 'name';
    matchKey = NAME_MAP[rawName] || rawName;
  }

  const typeRaw = get(col.type).toLowerCase();
  const type = REVENUE_TYPES.has(typeRaw) ? typeRaw : null;
  const febe = get(col.febe).toUpperCase();
  const segment = febe === 'FE' ? 'front_end' : febe === 'BE' ? 'back_end' : null;
  const source = get(col.source) || null;
  const feeVal = parseAmount(get(col.fee));
  const termVal = parseInt(get(col.term), 10);
  const term = Number.isFinite(termVal) && termVal > 0 ? termVal : null;

  let base = 0;
  let perf = 0;
  let passthrough = 0;
  let amount = collected;
  let amountPaid = collected;

  if (type === 'passthrough') {
    base = 0;
    perf = 0;
    passthrough = collected;
    amount = 0;
    amountPaid = 0;
    passthroughCount++;
    passthroughTotal += collected;
  } else if (type === 'performance') {
    perf = collected;
    revenueTotal += collected;
  } else {
    // mrr, pif, or unknown -> retainer bucket
    base = collected;
    revenueTotal += collected;
  }

  const noteBits = [
    `sheet revenue import`,
    `id ${rawId || '?'}`,
    get(col.type) || 'untyped',
    febe || null,
    source ? `src:${source}` : null,
  ].filter(Boolean);
  const note = noteBits.join(' \u00b7 ');

  valuesRows.push(
    `(${sql(matchKind)}, ${sql(matchKey)}, ${sql(date)}, ${numOrNull(amount)}, ${numOrNull(base)}, ` +
      `${numOrNull(perf)}, ${numOrNull(passthrough)}, ${numOrNull(amountPaid)}, ` +
      `${type ? sql(type) : 'null'}, ${segment ? sql(segment) : 'null'}, ${source ? sql(source) : 'null'}, ` +
      `${numOrNull(term)}, ${numOrNull(feeVal ?? 0)}, ${sql(note)})`,
  );

  if (matchKind === 'name' && CREATE_CLIENTS.has(matchKey) && !sourceByCreatedClient.has(matchKey)) {
    sourceByCreatedClient.set(matchKey, source);
  }

  const aggKey = `${matchKind}:${matchKey}`;
  const agg = perClient.get(aggKey) ?? { count: 0, revenue: 0 };
  agg.count++;
  agg.revenue += amount;
  perClient.set(aggKey, agg);
}

// ── Build SQL ───────────────────────────────────────────────────────────────
const out = [];
out.push("-- 1. Idempotent: clear any prior run of this import");
out.push("delete from client_billings where invoice_ref = 'revenue-import';");
out.push('');
out.push('-- 2. Create confirmed-missing clients as churned historical records');
for (const name of CREATE_CLIENTS) {
  const src = sourceByCreatedClient.get(name) || null;
  out.push(
    `insert into clients (name, is_live, lifecycle_status, source)\n` +
      `  values (${sql(name)}, false, 'churned', ${src ? sql(src) : 'null'})\n` +
      `  on conflict (name) do nothing;`,
  );
}
out.push('');
out.push('-- 3. Insert one paid billing per payment row');
out.push(
  `insert into client_billings (\n` +
    `  client_id, billed_on, due_date, paid_on, status, method, invoice_ref,\n` +
    `  amount, base_amount, performance_amount, passthrough_amount, amount_paid,\n` +
    `  revenue_type, revenue_segment, lead_source, term_months, processing_fee, note\n` +
    `)\n` +
    `select\n` +
    `  c.id, r.billed_on::date, r.billed_on::date, r.billed_on::date, 'paid', 'manual', 'revenue-import',\n` +
    `  r.amount::numeric, r.base::numeric, r.perf::numeric, r.passthrough::numeric, r.amount_paid::numeric,\n` +
    `  r.revenue_type, r.revenue_segment, r.lead_source, r.term_months::int, r.processing_fee::numeric, r.note\n` +
    `from (values\n` +
    valuesRows.map((v) => '  ' + v).join(',\n') +
    `\n) as r(match_kind, match_key, billed_on, amount, base, perf, passthrough, amount_paid,\n` +
    `        revenue_type, revenue_segment, lead_source, term_months, processing_fee, note)\n` +
    `join clients c on (\n` +
    `  (r.match_kind = 'clickup' and c.clickup_task_id = r.match_key) or\n` +
    `  (r.match_kind = 'name'    and lower(c.name) = lower(r.match_key))\n` +
    `);`,
);

process.stdout.write(out.join('\n') + '\n');

// ── Verification query (run AFTER creating clients): lists any unmatched keys ─
const keyPairs = [
  ...new Map(
    valuesRows.map((v) => {
      const m = v.match(/^\('(clickup|name)', ('(?:[^']|'')*')/);
      return [`${m[1]}|${m[2]}`, `(${sql(m[1])}, ${m[2]})`];
    }),
  ).values(),
];
const verifySql =
  `with r(match_kind, match_key) as (values\n  ` +
  keyPairs.join(',\n  ') +
  `\n)\nselect r.match_kind, r.match_key\nfrom r\nleft join clients c on (\n` +
  `  (r.match_kind = 'clickup' and c.clickup_task_id = r.match_key) or\n` +
  `  (r.match_kind = 'name'    and lower(c.name) = lower(r.match_key))\n` +
  `)\nwhere c.id is null;`;
writeFileSync(resolve(__dirname, 'out/revenue-verify.sql'), verifySql + '\n');

// ── Summary to stderr ────────────────────────────────────────────────────────
const lines = [];
lines.push(`Parsed rows           : ${valuesRows.length}`);
lines.push(`Skipped (blank/#N/A)  : ${skipped}`);
lines.push(`Clients to create     : ${CREATE_CLIENTS.size}`);
lines.push(`Revenue rows total    : $${revenueTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
lines.push(`Passthrough (excluded): ${passthroughCount} rows, $${passthroughTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
lines.push(`Distinct clients hit  : ${perClient.size}`);
process.stderr.write(lines.join('\n') + '\n');

#!/usr/bin/env node
/**
 * Backfill payroll gaps from Wise transaction-history.csv.
 *
 * - COMPLETED OUT transfers only
 * - Excludes Gabriel Goertzen
 * - Skips person+YYYY-MM already present in source=payroll
 * - Splits salary vs commissions using current base rates:
 *     Christian = flat salary (all payroll)
 *     Laura = $1000 salary, rest commissions
 *     Pedro Rio = $500 salary, rest commissions
 *     Luka / Bernardo = $400 salary, rest commissions
 *   Others = all payroll (no known base split)
 *
 *   npx tsx scripts/import-wise-payroll.mjs
 *   npx tsx scripts/import-wise-payroll.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const csvPath = path.join(root, 'data/import/expenses/wise-transaction-history-20260713.csv');

/** Wise Target name → roster display name */
const TARGET_MAP = {
  'Bernardo Fabris': 'Bernardo Fabris',
  'Christian Bokalli': 'Christian',
  'Laura Moreira Cesar Souza Moço': 'Laura Moço',
  'Pedro Henrique Moreira Rio': 'Pedro Rio',
  'Luka Faccini Zanon': 'Luka Faccini',
  'Yasmin  Potzik': 'Yamin Potzik',
  'Yasmin Potzik': 'Yamin Potzik',
  'Gabriela Ferrari Camargo Maranhão': 'Gabriela Maranhão',
  'Isaque Borges Paulino Silva': 'Isaque',
  'Layza de Oliveira Philadelfio  dos Santos': 'Layza',
  'Daniris Pedro da Silva Borba Cordeiro': 'Daniris',
  'Joaquim Spinelli Bittencourt Costa': 'Joaquim',
  'Pedro Henrique Moreira': 'Pedro Moreira',
};

/** Flat salary → entire payout is salary (no commission split). */
const FLAT_SALARY = new Set(['christian']);

/** Base salary used when splitting gap-month Wise totals. */
const BASE_SALARY = {
  'laura moco': 1000,
  'pedro rio': 500,
  'luka faccini': 400,
  'bernardo fabris': 400,
};

function loadEnv() {
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      row.push(field); field = '';
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
      i += c === '\r' ? 2 : 1;
      continue;
    }
    field += c; i++;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some(cell => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(s) {
  return normName(s).replace(/\s+/g, '-');
}

function matchAgent(displayName, agents) {
  const v = normName(displayName);
  for (const a of agents) {
    if (normName(a.name) === v) return a;
  }
  const first = v.split(' ')[0];
  if (first.length < 3) return null;
  const hits = agents.filter(a => normName(a.name).split(' ')[0] === first);
  return hits.length === 1 ? hits[0] : null;
}

function merchantKey(merchantRaw) {
  return normName(String(merchantRaw || '').replace(/^payroll\s*[—\-–]\s*/i, ''));
}

async function ensureAccount() {
  const name = 'WM Payroll (Wise)';
  const { data: existing } = await sb.from('finance_accounts').select('id').eq('name', name).maybeSingle();
  if (existing) return existing.id;
  if (!apply) {
    console.log('[dry-run] would create finance_accounts:', name);
    return 'dry-run-account';
  }
  const { data, error } = await sb.from('finance_accounts').insert({
    name,
    institution: 'Wise',
    account_type: 'other',
    entity: 'Waiz Media',
    is_business: true,
    active: true,
    notes: 'Wise payouts attributed as payroll OpEx (gap backfill). Chase Wise ACH stays exclude_from_pnl.',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

/**
 * Allocate monthly salary base across transfers chronologically.
 * Returns [{...txn, salaryPortion, commissionPortion}]
 */
function splitMonthTransfers(txns, displayKey) {
  const sorted = [...txns].sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
  if (FLAT_SALARY.has(displayKey)) {
    return sorted.map(t => ({ ...t, salaryPortion: t.amount, commissionPortion: 0 }));
  }
  let remainingBase = BASE_SALARY[displayKey] ?? 0;
  return sorted.map(t => {
    const salaryPortion = Math.min(remainingBase, t.amount);
    remainingBase -= salaryPortion;
    const commissionPortion = Number((t.amount - salaryPortion).toFixed(2));
    return { ...t, salaryPortion: Number(salaryPortion.toFixed(2)), commissionPortion };
  });
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }

  const { normalizeMerchant } = await import(
    pathToFileURL(path.join(root, 'src/lib/expenses.ts')).href
  );

  const table = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const headers = table[0].map(h => h.trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const get = (row, name) => (row[idx[name]] ?? '').trim();

  const { data: agents } = await sb.from('agents').select('id, name, active, base_salary').order('name');
  const agentList = agents ?? [];

  const { data: existingPay } = await sb
    .from('business_expenses')
    .select('id, external_id, occurred_on, merchant_raw, amount')
    .eq('source', 'payroll');

  const covered = new Set(); // `${norm}|${YYYY-MM}`
  const seenExt = new Set();
  for (const e of existingPay ?? []) {
    if (e.external_id) seenExt.add(e.external_id);
    const ym = String(e.occurred_on || '').slice(0, 7);
    const key = merchantKey(e.merchant_raw);
    if (ym && key) covered.add(`${key}|${ym}`);
    // also cover aliases for Bernardo sheet spelling
    if (key === 'bernado') covered.add(`bernardo fabris|${ym}`);
    if (key === 'bernardo fabris') covered.add(`bernado|${ym}`);
  }

  // Collect eligible Wise transfers
  const byPersonMonth = new Map(); // key -> txns[]
  let skippedGabriel = 0;
  let skippedStatus = 0;
  let skippedUnmapped = 0;
  let skippedCovered = 0;

  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    if (get(row, 'Direction') !== 'OUT') continue;
    if (get(row, 'Status') !== 'COMPLETED') {
      skippedStatus++;
      continue;
    }
    const target = get(row, 'Target name');
    if (/gabriel\s+goertzen/i.test(target)) {
      skippedGabriel++;
      continue;
    }
    const display = TARGET_MAP[target];
    if (!display) {
      skippedUnmapped++;
      continue;
    }
    const day = (get(row, 'Finished on') || get(row, 'Created on')).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const ym = day.slice(0, 7);
    const nKey = normName(display);
    if (covered.has(`${nKey}|${ym}`)) {
      skippedCovered++;
      continue;
    }
    const amount = Number(get(row, 'Source amount (after fees)'));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const mapKey = `${nKey}|${ym}`;
    if (!byPersonMonth.has(mapKey)) byPersonMonth.set(mapKey, []);
    byPersonMonth.get(mapKey).push({
      id: get(row, 'ID'),
      day,
      amount,
      fee: Number(get(row, 'Source fee amount') || 0) || 0,
      display,
      target,
    });
  }

  const accountId = await ensureAccount();
  const toInsert = [];
  const byPerson = {};

  for (const [mapKey, txns] of [...byPersonMonth.entries()].sort()) {
    const [nKey] = mapKey.split('|');
    const display = txns[0].display;
    const agent = matchAgent(display, agentList);
    const split = splitMonthTransfers(txns, nKey);

    for (const t of split) {
      const parts = [];
      if (t.salaryPortion > 0) parts.push({ sub: 'payroll', amount: t.salaryPortion, label: 'salary' });
      if (t.commissionPortion > 0) parts.push({ sub: 'commissions', amount: t.commissionPortion, label: 'commissions' });
      if (!parts.length) continue;

      for (const p of parts) {
        const externalId = `wise-payroll:${t.id}:${p.sub}:${p.amount.toFixed(2)}`;
        if (seenExt.has(externalId)) continue;
        seenExt.add(externalId);

        const merchant = `Payroll — ${agent?.name || display}`;
        const payrollRunId = agent
          ? `wise:${t.day}:${agent.id}:${p.sub}`
          : `wise:${t.day}:name:${slug(display)}:${p.sub}`;

        toInsert.push({
          occurred_on: t.day,
          amount: p.amount,
          currency: 'USD',
          account_id: accountId,
          source: 'payroll',
          merchant_raw: merchant,
          merchant_normalized: normalizeMerchant(merchant),
          memo: [
            'Wise payout',
            t.id,
            p.label,
            t.fee ? `fee $${t.fee.toFixed(2)} (excluded from amount)` : null,
            FLAT_SALARY.has(nKey) ? 'flat salary' : null,
            agent ? null : `unmatched: ${t.target}`,
          ].filter(Boolean).join(' · '),
          external_id: externalId,
          ceo_bucket: 'fulfillment',
          subcategory: p.sub,
          exclude_from_pnl: false,
          categorized_by: 'import',
          rule_id: null,
          payroll_run_id: payrollRunId,
          client_id: null,
          updated_at: new Date().toISOString(),
        });

        byPerson[display] = (byPerson[display] || 0) + p.amount;
      }
    }
  }

  const total = toInsert.reduce((s, r) => s + r.amount, 0);
  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN');
  console.log('would_insert:', toInsert.length, 'grand_total:', total.toFixed(2));
  console.log('skipped: gabriel=', skippedGabriel, 'status=', skippedStatus, 'unmapped=', skippedUnmapped, 'covered_month=', skippedCovered);
  console.log('by person:', byPerson);
  console.log('sample:', toInsert.slice(0, 10).map(r => ({
    date: r.occurred_on, merchant: r.merchant_raw, amount: r.amount, sub: r.subcategory, memo: r.memo,
  })));

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    return;
  }

  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH).map(r => ({ ...r, account_id: accountId }));
    const { error } = await sb.from('business_expenses').insert(chunk);
    if (error) {
      console.error('Insert failed', error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }
  console.log('Done.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

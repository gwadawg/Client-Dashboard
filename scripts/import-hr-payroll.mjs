#!/usr/bin/env node
/**
 * Import WM HR Reporting payroll CSV into business_expenses (source=payroll).
 *
 * Prefer HR totals for Sep 2025–Mar 2026 person-months: removes overlapping
 * sheet-payroll rows for the same person + calendar month, then inserts HR.
 *
 * Also seeds alumni agents for people on the HR file who are not on the live
 * roster (active=false) so historical pay stays attributable.
 *
 *   npx tsx scripts/import-hr-payroll.mjs           # dry-run
 *   npx tsx scripts/import-hr-payroll.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const csvPath = path.join(root, 'data/import/expenses/wm-hr-reporting-payroll.csv');

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** HR name → preferred roster display name (alumni seed / match). */
const NAME_ALIASES = {
  bernado: 'Bernardo Fabris',
  bernardo: 'Bernardo Fabris',
  christian: 'Christian',
  laura: 'Laura Moço',
  luka: 'Luka Faccini',
  'pedro rio': 'Pedro Rio',
};

/** People known not on the current roster → create as alumni. */
const ALUMNI_DEFAULTS = {
  'yamin potzik': { name: 'Yamin Potzik', pay_type: 'call_rep' },
  'gabriela maranhao': { name: 'Gabriela Maranhão', pay_type: 'call_rep' },
  joaquim: { name: 'Joaquim', pay_type: 'call_rep' },
  'pedro moreira': { name: 'Pedro Moreira', pay_type: 'call_rep' },
  daniris: { name: 'Daniris', pay_type: 'call_rep' },
  isaque: { name: 'Isaque', pay_type: 'operations' },
  layza: { name: 'Layza', pay_type: 'call_rep' },
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

function parseDate(s) {
  s = (s || '').trim();
  if (!s) return null;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!mdy) return null;
  const y = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
  return `${y}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
}

function amt(s) {
  if (s == null || String(s).trim() === '') return 0;
  const n = Number(String(s).replace(/[$,\s"]/g, ''));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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

function mapPosition(pos) {
  const p = (pos || '').toLowerCase();
  if (p.includes('media')) return 'media_buyer';
  if (p.includes('setter') || p.includes('b2b')) return 'b2b_setter';
  if (p.includes('manager') || p.includes('admin') || p.includes('ops')) return 'operations';
  if (p.includes('call')) return 'call_rep';
  return 'call_rep';
}

/**
 * Period month from DATE label + Pay Date / Start Date.
 * HR file quirks: Jan rows with Start 1/1/2025 + Pay 2/5/2026 → 2026-01;
 * Feb/Mar with 2025 pay dates after Dec 2025 → treat as 2026.
 */
function periodMonth(row, priorYearHint) {
  const label = (row.DATE || '').trim().toLowerCase();
  const mon = MONTHS[label];
  if (!mon) return null;

  const pay = parseDate(row['Pay Date']);
  const start = parseDate(row['Start Date']);

  let year = null;
  if (pay) {
    const [py, pm] = pay.split('-').map(Number);
    if (mon === 12 && pm === 1) year = py - 1;
    else if (pm === mon || pm === mon + 1 || (mon === 12 && pm === 1)) year = mon === 12 && pm === 1 ? py - 1 : py;
    else year = py;
  }
  if (year == null && start) year = Number(start.slice(0, 4));

  // After we've seen Dec 2025 / Jan 2026, bare Jan/Feb/Mar with 2025 start → 2026
  if (year === 2025 && mon <= 3 && priorYearHint >= 2025) year = 2026;
  // Laura January with empty pay after Dec 2025 block
  if (year === 2025 && mon === 1 && !pay && priorYearHint >= 2025) year = 2026;

  if (!year) return null;
  return `${year}-${String(mon).padStart(2, '0')}`;
}

function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function matchAgent(rawName, agents) {
  const canonical = NAME_ALIASES[normName(rawName)] || rawName;
  const v = normName(canonical);
  if (!v) return null;

  // Exact match on canonical / raw
  for (const a of agents) {
    if (normName(a.name) === v) return a;
  }

  const vParts = v.split(' ');
  // Single-token HR names (Laura, Christian, Luka) → unique first-name hit
  if (vParts.length === 1) {
    const first = vParts[0];
    if (first.length < 3) return null;
    const hits = agents.filter(a => normName(a.name).split(' ')[0] === first);
    return hits.length === 1 ? hits[0] : null;
  }

  // Multi-word: same first + last token (Bernardo Fabris ↔ Bernado Fabris via alias)
  const hits = agents.filter(a => {
    const parts = normName(a.name).split(' ');
    return parts[0] === vParts[0] && parts[parts.length - 1] === vParts[vParts.length - 1];
  });
  return hits.length === 1 ? hits[0] : null;
}

async function ensureAccount() {
  const name = 'WM Payroll (HR Reporting)';
  const { data: existing } = await sb.from('finance_accounts').select('id').eq('name', name).maybeSingle();
  if (existing) return existing.id;
  if (!apply) {
    console.log('[dry-run] would create finance_accounts:', name);
    return 'dry-run-account';
  }
  const { data, error } = await sb.from('finance_accounts').insert({
    name,
    institution: 'Waiz Media HR',
    account_type: 'other',
    entity: 'Waiz Media',
    is_business: true,
    active: true,
    notes: 'HR Reporting payroll CSV (salary / commissions / bonus / other)',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
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
  const idx = Object.fromEntries(headers.map((h, i) => [h.toLowerCase(), i]));
  const get = (row, name) => (row[idx[name.toLowerCase()]] ?? '').trim();

  let { data: agents } = await sb.from('agents').select('id, name, active, ended_on').order('name');
  agents = agents ?? [];

  // Parse HR rows
  const hrRows = [];
  let priorYearHint = 2024;
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const agentName = get(row, 'Agent');
    if (!agentName) continue;

    const salary = amt(get(row, 'Salary'));
    const commissions = amt(get(row, 'Commissions'));
    const bonus = amt(get(row, 'Bonus'));
    const other = amt(get(row, 'Other'));
    let total = amt(get(row, 'Total'));
    if (!total) total = salary + commissions + bonus + other;
    if (!total) continue;

    const obj = {
      DATE: get(row, 'DATE'),
      'Start Date': get(row, 'Start Date'),
      'Pay Date': get(row, 'Pay Date'),
      Agent: agentName,
      Position: get(row, 'Position'),
      Salary: salary,
      Commissions: commissions,
      Bonus: bonus,
      Other: other,
      Total: total,
      Processed: get(row, 'Processed?'),
    };
    const pm = periodMonth(obj, priorYearHint);
    if (!pm) continue;
    priorYearHint = Math.max(priorYearHint, Number(pm.slice(0, 4)));
    hrRows.push({ ...obj, period: pm, occurred_on: lastDayOfMonth(pm) });
  }

  // Seed alumni for HR people missing from roster
  const lastPeriodByNorm = {};
  const positionByNorm = {};
  for (const r of hrRows) {
    const n = normName(NAME_ALIASES[normName(r.Agent)] || r.Agent);
    lastPeriodByNorm[n] = r.period;
    if (r.Position) positionByNorm[n] = mapPosition(r.Position);
  }

  const alumniToCreate = [];
  for (const [key, def] of Object.entries(ALUMNI_DEFAULTS)) {
    if (matchAgent(def.name, agents)) continue;
    alumniToCreate.push({
      name: def.name,
      phone: `alumni-${slug(def.name)}`,
      pay_type: positionByNorm[key] || def.pay_type,
      active: false,
      ended_on: lastPeriodByNorm[key] ? lastDayOfMonth(lastPeriodByNorm[key]) : null,
      base_salary: 0,
      monthly_bonus: 0,
    });
  }

  console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN');
  console.log('hr_rows:', hrRows.length, 'total_$', hrRows.reduce((s, r) => s + r.Total, 0).toFixed(2));
  console.log('alumni_to_create:', alumniToCreate.map(a => a.name));

  if (apply && alumniToCreate.length) {
    const { data: inserted, error } = await sb.from('agents').insert(alumniToCreate).select('id, name, active');
    if (error) throw new Error(`alumni insert: ${error.message}`);
    agents = [...agents, ...(inserted ?? [])];
    console.log('created alumni:', (inserted ?? []).map(a => a.name));
  } else if (!apply && alumniToCreate.length) {
    // Fake ids for dry-run matching
    for (const a of alumniToCreate) {
      agents.push({ id: `dry-${slug(a.name)}`, name: a.name, active: false, ended_on: a.ended_on });
    }
  }

  const accountId = await ensureAccount();
  const { data: existing } = await sb
    .from('business_expenses')
    .select('id, external_id, occurred_on, merchant_raw, amount, source')
    .eq('source', 'payroll');
  const existingRows = existing ?? [];
  const seenExt = new Set(existingRows.map(e => e.external_id).filter(Boolean));

  const toInsert = [];
  const overlapKeys = new Set(); // `${norm}|${YYYY-MM}` covered by HR
  let matched = 0;
  let unmatched = 0;
  let skippedDup = 0;

  for (const r of hrRows) {
    const agent = matchAgent(r.Agent, agents);
    const display = agent?.name || (NAME_ALIASES[normName(r.Agent)] || r.Agent);
    const nKey = normName(display);
    overlapKeys.add(`${nKey}|${r.period}`);

    const parts = [];
    if (r.Salary) parts.push(`salary $${r.Salary.toFixed(2)}`);
    if (r.Commissions) parts.push(`commissions $${r.Commissions.toFixed(2)}`);
    if (r.Bonus) parts.push(`bonus $${r.Bonus.toFixed(2)}`);
    if (r.Other) parts.push(`other $${r.Other.toFixed(2)}`);
    if (r.Position) parts.push(r.Position);
    if (r['Pay Date']) parts.push(`paid ${r['Pay Date']}`);

    const merchant = `Payroll — ${display}`;
    const externalId = `hr-payroll:${r.period}:${slug(display)}:${r.Total.toFixed(2)}`;
    if (seenExt.has(externalId)) {
      skippedDup++;
      continue;
    }
    seenExt.add(externalId);

    if (agent) matched++;
    else unmatched++;

    const payrollRunId = agent
      ? `hr:${r.period}:${agent.id}`
      : `hr:${r.period}:name:${slug(display)}`;

    toInsert.push({
      occurred_on: r.occurred_on,
      amount: r.Total,
      currency: 'USD',
      account_id: accountId,
      source: 'payroll',
      merchant_raw: merchant,
      merchant_normalized: normalizeMerchant(merchant),
      memo: ['HR Reporting', ...parts].join(' · '),
      external_id: externalId,
      ceo_bucket: 'fulfillment',
      subcategory: r.Commissions && !r.Salary ? 'commissions' : 'payroll',
      exclude_from_pnl: false,
      categorized_by: 'import',
      rule_id: null,
      payroll_run_id: payrollRunId,
      client_id: null,
      updated_at: new Date().toISOString(),
    });
  }

  // Sheet payroll rows that overlap HR person-months (avoid double-count)
  const sheetOverlaps = existingRows.filter(e => {
    if (!e.external_id?.startsWith('sheet-payroll:')) return false;
    const m = (e.merchant_raw || '').replace(/^Payroll —\s*/i, '');
    const key = `${normName(NAME_ALIASES[normName(m)] || m)}|${String(e.occurred_on).slice(0, 7)}`;
    return overlapKeys.has(key);
  });

  console.log('would_insert:', toInsert.length, 'grand_total:', toInsert.reduce((s, r) => s + r.amount, 0).toFixed(2));
  console.log('matched_agents:', matched, 'unmatched:', unmatched, 'dup:', skippedDup);
  console.log('sheet_overlaps_to_remove:', sheetOverlaps.length,
    'amount:', sheetOverlaps.reduce((s, r) => s + Number(r.amount), 0).toFixed(2));
  console.log('sample:', toInsert.slice(0, 6).map(r => ({
    date: r.occurred_on, merchant: r.merchant_raw, amount: r.amount, run: r.payroll_run_id,
  })));

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    return;
  }

  if (sheetOverlaps.length) {
    const ids = sheetOverlaps.map(r => r.id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error } = await sb.from('business_expenses').delete().in('id', chunk);
      if (error) throw new Error(`delete overlap: ${error.message}`);
    }
    console.log('Removed overlapping sheet-payroll rows:', ids.length);
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

/**
 * Reconcile client payments: revenue CSV (master) + dashboard billings.
 *
 *   node scripts/reconcile-client-payments.mjs
 *   node scripts/reconcile-client-payments.mjs "/path/to/Revenue.csv"
 *   node scripts/reconcile-client-payments.mjs --audit data/import/roster-audit-2026-06-16.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseCsv } from './lib/csv.mjs';
import { createServiceClient, fetchAllRows } from './lib/supabase-client.mjs';
import { clientNamesMatch, normalizeClientNameForMatch } from './lib/roster-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const auditArg = args.find((a, i) => args[i - 1] === '--audit');
const csvPath =
  args.find(a => !a.startsWith('--') && a.endsWith('.csv')) ||
  '/Users/gwadawg/Desktop/WM _ Company Report - Revenue.csv';
const dateStamp = new Date().toISOString().slice(0, 10);
const outBase = resolve(__dirname, `../data/import/roster-payments-${dateStamp}`);

const BASE_NAME_MAP = {
  'Douglas Cavanah': 'Douglas Cavanaugh',
  RJ: 'RJ Hartnett',
  'Anthony Usher': 'Tony Usher',
  'Amir S': 'Amir Abuhalimeh',
  'Bryan Ashby': "Bryan Ashby's office",
};

const REVENUE_TYPES = new Set(['mrr', 'pif', 'performance', 'passthrough']);

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

function loadNameMap(auditPath) {
  const map = { ...BASE_NAME_MAP };
  if (!auditPath || !existsSync(auditPath)) return map;
  try {
    const audit = JSON.parse(readFileSync(auditPath, 'utf-8'));
    const hints = audit.duplicate_clusters?.flatMap(c => c.name_map_hints ?? []) ?? [];
    for (const h of hints) {
      if (h.csv_name && h.roster_name) map[h.csv_name] = h.roster_name;
    }
    const approved = resolve(__dirname, '../data/import/roster-cleanup-approved.json');
    if (existsSync(approved)) {
      const app = JSON.parse(readFileSync(approved, 'utf-8'));
      Object.assign(map, app.name_map_additions ?? {});
    }
  } catch {
    /* ignore */
  }
  return map;
}

function resolveClientId(clients, matchKind, matchKey, nameMap) {
  if (matchKind === 'clickup') {
    const c = clients.find(x => x.clickup_task_id === matchKey);
    return c?.id ?? null;
  }
  const key = nameMap[matchKey] || matchKey;
  const exact = clients.filter(c => c.name.toLowerCase() === key.toLowerCase());
  if (exact.length === 1) return exact[0].id;
  const norm = normalizeClientNameForMatch(key);
  const fuzzy = clients.filter(c => normalizeClientNameForMatch(c.name) === norm);
  if (fuzzy.length === 1) return fuzzy[0].id;
  if (fuzzy.length > 1) return { ambiguous: fuzzy.map(c => ({ id: c.id, name: c.name })) };
  return null;
}

function isRevenueImportRow(b) {
  if (b.invoice_ref === 'revenue-import' || b.invoice_ref === 'import') return true;
  return (b.note ?? '').toLowerCase().includes('sheet revenue import');
}

function billingKey(clientId, paidOn, amount) {
  return `${clientId}|${paidOn}|${Number(amount).toFixed(2)}`;
}

function parseRevenueCsv(nameMap) {
  if (!existsSync(csvPath)) {
    return { rows: [], error: `CSV not found: ${csvPath}`, skipped: 0 };
  }
  const table = parseCsv(readFileSync(csvPath, 'utf-8'));
  const headers = table[0].map(h => h.trim());
  const idx = name => headers.indexOf(name);
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

  const rows = [];
  let skipped = 0;
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const get = i => (i >= 0 ? (cells[i] ?? '').trim() : '');
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

    let matchKind, matchKey;
    if (rawId && /[a-z]/i.test(rawId)) {
      matchKind = 'clickup';
      matchKey = rawId;
    } else {
      matchKind = 'name';
      matchKey = nameMap[rawName] || rawName;
    }

    const typeRaw = get(col.type).toLowerCase();
    const type = REVENUE_TYPES.has(typeRaw) ? typeRaw : null;
    const febe = get(col.febe).toUpperCase();
    const segment = febe === 'FE' ? 'front_end' : febe === 'BE' ? 'back_end' : null;

    rows.push({
      csv_row: r + 1,
      raw_name: rawName,
      raw_id: rawId,
      match_kind: matchKind,
      match_key: matchKey,
      billed_on: date,
      amount_paid: collected,
      revenue_type: type,
      revenue_segment: segment,
      lead_source: get(col.source) || null,
      term: parseInt(get(col.term), 10) || null,
      fee: parseAmount(get(col.fee)),
      type_label: get(col.type),
    });
  }
  return { rows, skipped };
}

async function main() {
  const nameMap = loadNameMap(auditArg);
  const supa = createServiceClient();

  console.log('Loading clients and billings…');
  const clients = await fetchAllRows(supa, 'clients', {
    select: 'id, name, clickup_task_id, lifecycle_status',
  });
  const billings = await fetchAllRows(supa, 'client_billings', {
    select:
      'id, client_id, billed_on, paid_on, amount, amount_paid, status, invoice_ref, note, revenue_type',
  });

  const clientById = new Map(clients.map(c => [c.id, c]));
  const csvResult = parseRevenueCsv(nameMap);
  const csvRows = csvResult.rows ?? [];

  const revenueImports = billings.filter(isRevenueImportRow);
  const dashboardBillings = billings.filter(b => !isRevenueImportRow(b));

  const csvReconciliation = {
    matched: [],
    missing_in_db: [],
    wrong_client_id: [],
    amount_mismatch: [],
    duplicate_billing: [],
    unmatched_client: [],
    ambiguous_client: [],
  };

  const dbImportByKey = new Map();
  for (const b of revenueImports) {
    const paidOn = (b.paid_on ?? b.billed_on)?.slice(0, 10);
    const key = billingKey(b.client_id, paidOn, b.amount_paid ?? b.amount);
    if (dbImportByKey.has(key)) {
      csvReconciliation.duplicate_billing.push({
        key,
        billing_ids: [dbImportByKey.get(key).id, b.id],
      });
    } else {
      dbImportByKey.set(key, b);
    }
  }

  const matchedDbKeys = new Set();

  for (const row of csvRows) {
    const resolved = resolveClientId(clients, row.match_kind, row.match_key, nameMap);
    if (resolved && typeof resolved === 'object' && resolved.ambiguous) {
      csvReconciliation.ambiguous_client.push({ ...row, candidates: resolved.ambiguous });
      continue;
    }
    if (!resolved) {
      csvReconciliation.unmatched_client.push(row);
      continue;
    }

    const key = billingKey(resolved, row.billed_on, row.amount_paid);
    const dbRow = dbImportByKey.get(key);
    if (!dbRow) {
      csvReconciliation.missing_in_db.push({ ...row, expected_client_id: resolved });
      continue;
    }
    matchedDbKeys.add(key);
    if (dbRow.client_id !== resolved) {
      csvReconciliation.wrong_client_id.push({
        billing_id: dbRow.id,
        db_client_id: dbRow.client_id,
        db_client_name: clientById.get(dbRow.client_id)?.name,
        expected_client_id: resolved,
        expected_client_name: clientById.get(resolved)?.name,
        ...row,
      });
    } else {
      const dbAmt = Number(dbRow.amount_paid ?? dbRow.amount);
      if (Math.abs(dbAmt - row.amount_paid) > 0.01) {
        csvReconciliation.amount_mismatch.push({
          billing_id: dbRow.id,
          db_amount: dbAmt,
          csv_amount: row.amount_paid,
          ...row,
        });
      } else {
        csvReconciliation.matched.push({ billing_id: dbRow.id, client_id: resolved, ...row });
      }
    }
  }

  for (const [key, b] of dbImportByKey) {
    if (!matchedDbKeys.has(key)) {
      csvReconciliation.missing_in_db.push({
        direction: 'db_only',
        billing_id: b.id,
        client_id: b.client_id,
        client_name: clientById.get(b.client_id)?.name,
        paid_on: (b.paid_on ?? b.billed_on)?.slice(0, 10),
        amount: b.amount_paid ?? b.amount,
      });
    }
  }

  const clusterCanonical = new Map();
  const auditPath =
    auditArg || resolve(__dirname, `../data/import/roster-audit-${dateStamp}.json`);
  if (existsSync(auditPath)) {
    const audit = JSON.parse(readFileSync(auditPath, 'utf-8'));
    for (const cl of audit.duplicate_clusters ?? []) {
      for (const m of cl.members ?? []) {
        if (!m.is_canonical) clusterCanonical.set(m.id, cl.suggested_canonical_id);
      }
    }
  }

  const dashboardIssues = [];
  const suggestedPaymentMoves = [];

  for (const b of dashboardBillings) {
    const client = clientById.get(b.client_id);
    const canonicalId = clusterCanonical.get(b.client_id);
    if (canonicalId && canonicalId !== b.client_id) {
      dashboardIssues.push({
        type: 'billing_on_duplicate',
        billing_id: b.id,
        client_id: b.client_id,
        client_name: client?.name,
        canonical_id: canonicalId,
        canonical_name: clientById.get(canonicalId)?.name,
        amount: b.amount_paid ?? b.amount,
        paid_on: b.paid_on ?? b.billed_on,
        invoice_ref: b.invoice_ref,
      });
      suggestedPaymentMoves.push({
        billing_id: b.id,
        from_client_id: b.client_id,
        to_client_id: canonicalId,
        reason: 'duplicate_cluster_canonical',
      });
    }
    if (!client) {
      dashboardIssues.push({
        type: 'orphan_billing_client',
        billing_id: b.id,
        client_id: b.client_id,
        amount: b.amount_paid ?? b.amount,
      });
    }
  }

  for (const w of csvReconciliation.wrong_client_id) {
    suggestedPaymentMoves.push({
      billing_id: w.billing_id,
      from_client_id: w.db_client_id,
      to_client_id: w.expected_client_id,
      reason: 'csv_client_mismatch',
    });
  }

  const csvTotalsByClient = new Map();
  for (const row of csvRows) {
    const resolved = resolveClientId(clients, row.match_kind, row.match_key, nameMap);
    if (!resolved || typeof resolved === 'object') continue;
    const canon = clusterCanonical.get(resolved) ?? resolved;
    csvTotalsByClient.set(canon, (csvTotalsByClient.get(canon) ?? 0) + row.amount_paid);
  }

  const dbTotalsByClient = new Map();
  for (const b of billings) {
    if (b.status === 'voided') continue;
    const canon = clusterCanonical.get(b.client_id) ?? b.client_id;
    const amt = Number(b.amount_paid ?? b.amount ?? 0);
    dbTotalsByClient.set(canon, (dbTotalsByClient.get(canon) ?? 0) + amt);
  }

  const totalMismatches = [];
  for (const [clientId, csvTotal] of csvTotalsByClient) {
    const dbTotal = dbTotalsByClient.get(clientId) ?? 0;
    if (Math.abs(csvTotal - dbTotal) > 0.5) {
      totalMismatches.push({
        client_id: clientId,
        client_name: clientById.get(clientId)?.name,
        csv_total: Math.round(csvTotal * 100) / 100,
        db_total: Math.round(dbTotal * 100) / 100,
        delta: Math.round((dbTotal - csvTotal) * 100) / 100,
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    csv_path: csvPath,
    csv_found: existsSync(csvPath),
    name_map: nameMap,
    summary: {
      csv_rows: csvRows.length,
      csv_skipped: csvResult.skipped ?? 0,
      revenue_import_billings: revenueImports.length,
      dashboard_billings: dashboardBillings.length,
      csv_matched: csvReconciliation.matched.length,
      csv_missing: csvReconciliation.missing_in_db.filter(x => !x.direction).length,
      csv_wrong_client: csvReconciliation.wrong_client_id.length,
      csv_unmatched_clients: csvReconciliation.unmatched_client.length,
      dashboard_on_duplicate: dashboardIssues.filter(i => i.type === 'billing_on_duplicate').length,
      total_mismatches: totalMismatches.length,
      suggested_payment_moves: suggestedPaymentMoves.length,
    },
    csv_reconciliation: csvReconciliation,
    dashboard_issues: dashboardIssues,
    total_mismatches: totalMismatches,
    suggested_payment_moves: suggestedPaymentMoves,
  };

  mkdirSync(dirname(outBase + '.json'), { recursive: true });
  writeFileSync(`${outBase}.json`, JSON.stringify(report, null, 2));

  const approvedPath = resolve(__dirname, '../data/import/roster-cleanup-approved.json');
  if (existsSync(approvedPath) && args.includes('--update-approval')) {
    const approved = JSON.parse(readFileSync(approvedPath, 'utf-8'));
    if (suggestedPaymentMoves.length) {
      approved.payment_moves = suggestedPaymentMoves;
    }
    approved.name_map_additions = { ...approved.name_map_additions, ...nameMap };
    writeFileSync(approvedPath, JSON.stringify(approved, null, 2) + '\n');
    console.log(`Updated ${approvedPath}`);
  }

  console.log(`CSV rows parsed: ${csvRows.length}`);
  console.log(`CSV matched in DB: ${csvReconciliation.matched.length}`);
  console.log(`CSV missing in DB: ${report.summary.csv_missing}`);
  console.log(`Wrong client_id: ${csvReconciliation.wrong_client_id.length}`);
  console.log(`Unmatched CSV clients: ${csvReconciliation.unmatched_client.length}`);
  console.log(`Dashboard billings on duplicates: ${report.summary.dashboard_on_duplicate}`);
  console.log(`Per-client total mismatches: ${totalMismatches.length}`);
  console.log(`Report: ${outBase}.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

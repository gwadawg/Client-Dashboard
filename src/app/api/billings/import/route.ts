import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import { parseCsv } from '@/lib/csv';

const BATCH = 200;

function headerIndex(headers: string[], ...candidates: string[]): number {
  const lower = headers.map(h => h.trim().toLowerCase());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(value: string): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Accepts YYYY-MM-DD or M/D/YYYY; returns a YYYY-MM-DD string or null.
function toYmd(value: string): string | null {
  const s = (value ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const [, m, d, yRaw] = mdy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

type ImportRow = {
  client_id: string;
  billed_on: string;
  due_date: string;
  base_amount: number;
  amount: number;
  amount_paid: number;
  status: 'paid';
  paid_on: string;
  method?: string;
  note?: string;
  invoice_ref: string;
  created_by: string | null;
};

// POST /api/billings/import — load historical per-payment rows from a CSV.
// Body: { csv: string, dryRun?: boolean }. Each row becomes a fully-paid
// billing dated on the payment date. dryRun returns a preview without writing.
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const body = await req.json();
  const csv: string = body?.csv ?? '';
  const dryRun: boolean = body?.dryRun !== false; // default to a safe preview
  if (!csv.trim()) return NextResponse.json({ error: 'csv is required' }, { status: 400 });

  const table = parseCsv(csv);
  if (table.length < 2) return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });

  const headers = table[0].map(h => h.trim());
  const col = {
    client: headerIndex(headers, 'client', 'client name', 'name'),
    date: headerIndex(headers, 'date', 'paid_on', 'paid on', 'payment date'),
    amount: headerIndex(headers, 'amount', 'amount paid', 'paid', 'total'),
    method: headerIndex(headers, 'method', 'payment method'),
    note: headerIndex(headers, 'note', 'memo', 'description'),
  };
  const missing: string[] = [];
  if (col.client === -1) missing.push('client');
  if (col.date === -1) missing.push('date');
  if (col.amount === -1) missing.push('amount');
  if (missing.length)
    return NextResponse.json({ error: `Missing required column(s): ${missing.join(', ')}` }, { status: 400 });

  // Resolve client names -> ids (case-insensitive).
  const { data: clientRows, error: clientErr } = await ctx.service.from('clients').select('id, name');
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });
  const idByName = new Map<string, string>();
  for (const c of clientRows ?? []) idByName.set(c.name.trim().toLowerCase(), c.id);

  // Existing paid rows for dedupe.
  const { data: existing, error: existErr } = await ctx.service
    .from('client_billings')
    .select('client_id, paid_on, amount')
    .eq('status', 'paid');
  if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
  const seen = new Set<string>();
  for (const e of existing ?? []) seen.add(`${e.client_id}|${e.paid_on}|${Number(e.amount)}`);

  const rows: ImportRow[] = [];
  const unmatched = new Set<string>();
  const perClient = new Map<string, { name: string; count: number; total: number }>();
  let skippedInvalid = 0;
  let skippedDuplicate = 0;

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const get = (i: number) => (i >= 0 ? (cells[i] ?? '').trim() : '');

    const name = get(col.client);
    const date = toYmd(get(col.date));
    const amount = parseAmount(get(col.amount));

    if (!name) { skippedInvalid++; continue; }
    const clientId = idByName.get(name.toLowerCase());
    if (!clientId) { unmatched.add(name); continue; }
    if (!date || amount == null) { skippedInvalid++; continue; }

    const key = `${clientId}|${date}|${amount}`;
    if (seen.has(key)) { skippedDuplicate++; continue; }
    seen.add(key);

    rows.push({
      client_id: clientId,
      billed_on: date,
      due_date: date,
      base_amount: amount,
      amount,
      amount_paid: amount,
      status: 'paid',
      paid_on: date,
      method: get(col.method) || undefined,
      note: get(col.note) || undefined,
      invoice_ref: 'import',
      created_by: ctx.userId,
    });

    const agg = perClient.get(clientId) ?? { name, count: 0, total: 0 };
    agg.count += 1;
    agg.total += amount;
    perClient.set(clientId, agg);
  }

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const summary = {
    matched_rows: rows.length,
    total_amount: totalAmount,
    per_client: [...perClient.values()].sort((a, b) => a.name.localeCompare(b.name)),
    unmatched: [...unmatched].sort(),
    skipped_invalid: skippedInvalid,
    skipped_duplicate: skippedDuplicate,
  };

  if (dryRun) {
    return NextResponse.json({ dry_run: true, ...summary });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await ctx.service.from('client_billings').insert(batch);
    if (error) return NextResponse.json({ error: error.message, inserted }, { status: 500 });
    inserted += batch.length;
  }

  return NextResponse.json({ dry_run: false, inserted, ...summary });
}

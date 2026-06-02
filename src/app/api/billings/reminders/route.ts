import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';
import { computeNextBillingDate, deriveStatus, type BillingRow } from '@/lib/billing';

const CLIENT_BILLING_FIELDS = 'id, name, is_live, mrr, billing_type, date_signed';
const BILLING_FIELDS = 'client_id, billed_on, status';
const CLICKUP_API = 'https://api.clickup.com/api/v2';

type ReminderClient = {
  id: string;
  name: string;
  is_live: boolean | null;
  mrr: number | null;
  billing_type: string | null;
  date_signed: string | null;
};

function fmtMoney(n: number | null): string {
  if (typeof n !== 'number') return 'n/a';
  return `$${n.toLocaleString('en-US')}`;
}

async function createClickUpTask(
  listId: string,
  token: string,
  client: ReminderClient,
  nextDate: string,
  status: string,
) {
  const dueMs = Date.parse(`${nextDate}T00:00:00Z`);
  const res = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Billing ${status === 'overdue' ? 'OVERDUE' : 'due'}: ${client.name} (${nextDate})`,
      description:
        `Client: ${client.name}\n` +
        `Status: ${status}\n` +
        `Next billing date: ${nextDate}\n` +
        `Monthly: ${fmtMoney(client.mrr)}\n` +
        `Billing type: ${client.billing_type ?? 'n/a'}`,
      due_date: Number.isNaN(dueMs) ? undefined : dueMs,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp ${res.status}: ${text}`);
  }
  return res.json();
}

// POST /api/billings/reminders — secret-guarded; called by an external scheduler.
// Creates a ClickUp task for every client whose next billing is due soon / overdue.
export async function POST(req: Request) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_BILLING_LIST_ID;
  if (!token || !listId) {
    return NextResponse.json(
      { error: 'CLICKUP_API_TOKEN and CLICKUP_BILLING_LIST_ID must be set' },
      { status: 500 },
    );
  }

  const service = createServiceClient();
  const [clientsRes, billingsRes] = await Promise.all([
    service.from('clients').select(CLIENT_BILLING_FIELDS).eq('is_live', true),
    service.from('client_billings').select(BILLING_FIELDS).order('billed_on', { ascending: false }),
  ]);

  if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });
  if (billingsRes.error) return NextResponse.json({ error: billingsRes.error.message }, { status: 500 });

  const lastByClient = new Map<string, BillingRow>();
  for (const b of billingsRes.data ?? []) {
    if (!lastByClient.has(b.client_id)) lastByClient.set(b.client_id, b as BillingRow);
  }

  const now = new Date();
  const due: { client: ReminderClient; nextDate: string; status: string }[] = [];
  for (const c of (clientsRes.data ?? []) as ReminderClient[]) {
    const nextDate = computeNextBillingDate(c, lastByClient.get(c.id) ?? null);
    const status = deriveStatus(nextDate, now);
    if (nextDate && (status === 'overdue' || status === 'due_soon')) {
      due.push({ client: c, nextDate, status });
    }
  }

  let created = 0;
  const errors: { client: string; error: string }[] = [];
  for (const { client, nextDate, status } of due) {
    try {
      await createClickUpTask(listId, token, client, nextDate, status);
      created += 1;
    } catch (e) {
      errors.push({ client: client.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ matched: due.length, created, errors });
}

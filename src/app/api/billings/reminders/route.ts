import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';
import { VOIDED_BILLING_STATUS } from '@/lib/billing-query';
import { computeNextBillingDate, deriveStatus, type BillingRow } from '@/lib/billing';
import { createClickUpTask, fmtMoney, getClickUpToken } from '@/lib/clickup';

const CLIENT_BILLING_FIELDS = 'id, name, is_live, mrr, billing_type, billing_day, launch_date, date_signed';
const BILLING_FIELDS = 'client_id, billed_on, status';

type ReminderClient = {
  id: string;
  name: string;
  is_live: boolean | null;
  mrr: number | null;
  billing_type: string | null;
  billing_day: number | null;
  launch_date: string | null;
  date_signed: string | null;
};

// POST /api/billings/reminders — secret-guarded; called by an external scheduler.
// Creates a ClickUp task for every client whose next billing is due soon / overdue.
export async function POST(req: Request) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = getClickUpToken();
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
    service
      .from('client_billings')
      .select(BILLING_FIELDS)
      .neq('status', VOIDED_BILLING_STATUS)
      .order('billed_on', { ascending: false }),
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

  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let skipped = 0;
  const errors: { client: string; error: string }[] = [];
  for (const { client, nextDate, status } of due) {
    const { data: existing } = await service
      .from('billing_reminder_log')
      .select('id')
      .eq('client_id', client.id)
      .eq('reminder_date', today)
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    try {
      const dueMs = Date.parse(`${nextDate}T00:00:00Z`);
      const task = await createClickUpTask(listId, token, {
        name: `Billing ${status === 'overdue' ? 'OVERDUE' : 'due'}: ${client.name} (${nextDate})`,
        description:
          `Client: ${client.name}\n` +
          `Status: ${status}\n` +
          `Next billing date: ${nextDate}\n` +
          `Monthly: ${fmtMoney(client.mrr)}\n` +
          `Billing type: ${client.billing_type ?? 'n/a'}`,
        due_date: Number.isNaN(dueMs) ? undefined : dueMs,
      });
      await service.from('billing_reminder_log').insert({
        client_id: client.id,
        reminder_date: today,
        next_billing_date: nextDate,
        clickup_task_id: task?.id != null ? String(task.id) : null,
      });
      created += 1;
    } catch (e) {
      errors.push({ client: client.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ matched: due.length, created, skipped, errors });
}

/**
 * Show pay is once-per-lead lifetime.
 *
 * - Within a payroll period: at most one credited show event per lead key
 *   (across all agents). Earliest pay date wins; ties break on event id.
 * - Across periods: a lead that already appears as a non-excluded show line
 *   on any *submitted* call-rep payroll cannot earn show pay again (any agent).
 * - Concurrent submit races are closed with payroll_show_pay_claims (unique lead_key).
 *
 * Booking + show on the same lead still allowed; live-transfer stacking rules
 * live in payroll-line-item-duplicates.ts.
 */
import { showPayDate } from '@/lib/agent-commissions';
import type { LineItemExclusion } from '@/lib/payroll-line-item-duplicates';
import { leadMatchKey } from '@/lib/payroll-line-item-duplicates';

export const SHOW_ALREADY_PAID_REASON =
  'Show already paid for this lead in a prior (or earlier submitted) payroll — one show credit per lead lifetime';

export const SHOW_DUPLICATE_PERIOD_REASON =
  'Duplicate show for this lead this period — only the earliest show is paid';

export const SHOW_CLAIM_LOST_REASON =
  'Show credit claimed by another agent first — one show pay per lead lifetime';

export type PaidShowSourceLine = {
  type?: string;
  event_id?: string;
  lead_name?: string | null;
  lead_phone?: string | null;
  unit_pay?: number;
};

export type PaidShowSourceEmployee = {
  section?: string | null;
  line_items?: unknown[] | null;
  line_item_exclusions?: LineItemExclusion[] | null;
};

export function showLeadMatchKey(item: {
  lead_phone?: string | null;
  lead_name?: string | null;
}): string {
  return leadMatchKey({
    lead_phone: item.lead_phone ?? null,
    lead_name: item.lead_name ?? null,
  });
}

/** Lead keys that were locked as paid shows on a submitted employee snapshot. */
export function extractPaidShowLeadKeysFromEmployee(emp: PaidShowSourceEmployee): string[] {
  if (emp.section && emp.section !== 'call_rep') return [];

  const excluded = new Set((emp.line_item_exclusions ?? []).map(e => e.event_id));
  const keys: string[] = [];

  for (const raw of emp.line_items ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as PaidShowSourceLine;
    if (item.type !== 'show') continue;
    if (!item.event_id || excluded.has(item.event_id)) continue;
    const key = showLeadMatchKey(item);
    if (key) keys.push(key);
  }

  return keys;
}

export function mergePaidShowLeadKeys(employees: PaidShowSourceEmployee[]): Set<string> {
  const keys = new Set<string>();
  for (const emp of employees) {
    for (const k of extractPaidShowLeadKeysFromEmployee(emp)) keys.add(k);
  }
  return keys;
}

/** Show line event_ids on this snapshot that still pay (not excluded). */
export function payingShowLines(
  lineItems: unknown[] | null | undefined,
  exclusions: LineItemExclusion[] = [],
): Array<{ event_id: string; lead_key: string; lead_name: string | null; lead_phone: string | null }> {
  const excluded = new Set(exclusions.map(e => e.event_id));
  const out: Array<{
    event_id: string;
    lead_key: string;
    lead_name: string | null;
    lead_phone: string | null;
  }> = [];
  for (const raw of lineItems ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as PaidShowSourceLine;
    if (item.type !== 'show' || !item.event_id || excluded.has(item.event_id)) continue;
    const lead_key = showLeadMatchKey(item);
    if (!lead_key) continue;
    out.push({
      event_id: item.event_id,
      lead_key,
      lead_name: item.lead_name ?? null,
      lead_phone: item.lead_phone ?? null,
    });
  }
  return out;
}

/**
 * Auto-exclude paying show lines whose lead already received show pay.
 * Also collapses same-agent duplicate lead keys within this submission.
 */
export function autoExcludeBannedShowPays(
  lineItems: unknown[] | null | undefined,
  exclusions: LineItemExclusion[],
  paidLeadKeys: Set<string>,
): LineItemExclusion[] {
  const next = [...exclusions];
  const seenEvent = new Set(next.map(e => e.event_id));
  const seenLead = new Set<string>();

  // Start from shows not already excluded by the reviewer.
  for (const show of payingShowLines(lineItems, exclusions)) {
    if (paidLeadKeys.has(show.lead_key)) {
      if (!seenEvent.has(show.event_id)) {
        next.push({ event_id: show.event_id, reason: SHOW_ALREADY_PAID_REASON });
        seenEvent.add(show.event_id);
      }
      continue;
    }
    if (seenLead.has(show.lead_key)) {
      if (!seenEvent.has(show.event_id)) {
        next.push({ event_id: show.event_id, reason: SHOW_DUPLICATE_PERIOD_REASON });
        seenEvent.add(show.event_id);
      }
      continue;
    }
    seenLead.add(show.lead_key);
  }
  return next;
}

export type ShowEventLike = {
  id: string;
  event_type?: string;
  agent_name?: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  scheduled_at?: string | null;
  occurred_at?: string | null;
  raw?: { recorded_at?: string } | null;
};

export type SuppressedShow = {
  event_id: string;
  lead_key: string;
  reason: string;
  agent_name: string | null;
  date: string | null;
};

/**
 * Keep at most one pay-eligible show per lead key for the period,
 * and drop any lead that was already paid in a submitted payroll.
 */
export function filterShowsOncePerLead<T extends ShowEventLike>(
  shows: T[],
  opts: {
    resolveAgent: (raw: string | null | undefined) => string | null;
    startDate: string;
    endDate: string;
    paidLeadKeys: Set<string>;
  },
): { allowed: T[]; suppressed: SuppressedShow[] } {
  const { resolveAgent, startDate, endDate, paidLeadKeys } = opts;
  const suppressed: SuppressedShow[] = [];
  const allowed: T[] = [];

  type Contender = { row: T; agent: string; date: string; lead_key: string };
  const contenders: Contender[] = [];
  const passthrough: T[] = [];

  for (const row of shows) {
    if (row.event_type && row.event_type !== 'show') {
      allowed.push(row);
      continue;
    }

    const agent = resolveAgent(row.agent_name);
    const date = showPayDate(row);
    const inPeriod = Boolean(date && date >= startDate && date <= endDate);
    const lead_key = showLeadMatchKey(row);

    if (!agent || !inPeriod) {
      passthrough.push(row);
      continue;
    }

    if (!lead_key) {
      contenders.push({ row, agent, date: date!, lead_key: `event:${row.id}` });
      continue;
    }

    if (paidLeadKeys.has(lead_key)) {
      suppressed.push({
        event_id: row.id,
        lead_key,
        reason: SHOW_ALREADY_PAID_REASON,
        agent_name: agent,
        date,
      });
      continue;
    }

    contenders.push({ row, agent, date: date!, lead_key });
  }

  const byLead = new Map<string, Contender[]>();
  for (const c of contenders) {
    const list = byLead.get(c.lead_key) ?? [];
    list.push(c);
    byLead.set(c.lead_key, list);
  }

  for (const [lead_key, group] of byLead) {
    group.sort(
      (a, b) => a.date.localeCompare(b.date) || a.row.id.localeCompare(b.row.id),
    );
    const [winner, ...dupes] = group;
    allowed.push(winner.row);
    for (const d of dupes) {
      suppressed.push({
        event_id: d.row.id,
        lead_key,
        reason: SHOW_DUPLICATE_PERIOD_REASON,
        agent_name: d.agent,
        date: d.date,
      });
    }
  }

  allowed.push(...passthrough);
  return { allowed, suppressed };
}

/** Submitted snapshots + claim table. */
export async function fetchPaidShowLeadKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: { from: (table: string) => any },
): Promise<Set<string>> {
  const keys = new Set<string>();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await service
      .from('payroll_run_employees')
      .select('section, line_items, line_item_exclusions')
      .eq('section', 'call_rep')
      .not('submitted_at', 'is', null)
      .range(from, from + page - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as PaidShowSourceEmployee[];
    for (const emp of batch) {
      for (const k of extractPaidShowLeadKeysFromEmployee(emp)) keys.add(k);
    }
    if (batch.length < page) break;
  }

  try {
    for (let from = 0; ; from += page) {
      const { data, error } = await service
        .from('payroll_show_pay_claims')
        .select('lead_key')
        .range(from, from + page - 1);
      if (error) {
        if (/does not exist|schema cache|PGRST/i.test(error.message)) break;
        throw new Error(error.message);
      }
      const batch = data ?? [];
      for (const row of batch as { lead_key: string }[]) {
        if (row.lead_key) keys.add(row.lead_key);
      }
      if (batch.length < page) break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/does not exist|schema cache|PGRST/i.test(msg)) throw e;
  }

  return keys;
}

export type ShowPayClaim = {
  lead_key: string;
  agent_id: string | null;
  agent_name: string;
  event_id: string;
  period_month: string;
};

export async function claimShowPayLeads(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: { from: (table: string) => any },
  claims: ShowPayClaim[],
): Promise<{ claimed: string[]; lostEventIds: string[] }> {
  const claimed: string[] = [];
  const lostEventIds: string[] = [];
  if (claims.length === 0) return { claimed, lostEventIds };

  for (const claim of claims) {
    const { error } = await service.from('payroll_show_pay_claims').insert({
      lead_key: claim.lead_key,
      agent_id: claim.agent_id,
      agent_name: claim.agent_name,
      event_id: claim.event_id,
      period_month: claim.period_month,
    });
    if (!error) {
      claimed.push(claim.event_id);
      continue;
    }
    if (error.code === '23505' || /duplicate|unique/i.test(error.message ?? '')) {
      const { data: existing } = await service
        .from('payroll_show_pay_claims')
        .select('event_id, agent_id, agent_name')
        .eq('lead_key', claim.lead_key)
        .maybeSingle();
      if (
        existing &&
        (existing.event_id === claim.event_id ||
          (claim.agent_id && existing.agent_id === claim.agent_id) ||
          existing.agent_name === claim.agent_name)
      ) {
        if (existing.event_id !== claim.event_id) {
          await service
            .from('payroll_show_pay_claims')
            .update({
              event_id: claim.event_id,
              period_month: claim.period_month,
              agent_id: claim.agent_id,
              agent_name: claim.agent_name,
              claimed_at: new Date().toISOString(),
            })
            .eq('lead_key', claim.lead_key);
        }
        claimed.push(claim.event_id);
      } else {
        lostEventIds.push(claim.event_id);
      }
      continue;
    }
    if (/does not exist|schema cache|PGRST/i.test(error.message ?? '')) {
      claimed.push(claim.event_id);
      continue;
    }
    throw new Error(error.message);
  }

  return { claimed, lostEventIds };
}

export async function releaseShowPayClaimsForEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: { from: (table: string) => any },
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  const { error } = await service.from('payroll_show_pay_claims').delete().in('event_id', eventIds);
  if (error && !/does not exist|schema cache|PGRST/i.test(error.message ?? '')) {
    throw new Error(error.message);
  }
}

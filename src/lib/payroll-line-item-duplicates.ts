import type { AgentCommissionRow } from '@/lib/agent-commissions';
import type { B2BSetterCommissionRow } from '@/lib/b2b-setter-commissions';
import { normalizePhone } from '@/lib/contact-key';

export const DUPLICATE_LEAD_EXCLUSION_REASON =
  'Duplicate lead — only one conversation credit per lead';

export type PayrollReviewLineItem = {
  event_id: string;
  date: string;
  type: string;
  lead_name: string | null;
  lead_phone: string | null;
  client_name?: string;
  unit_pay: number;
};

export type LineItemExclusion = {
  event_id: string;
  reason: string;
};

export type DuplicateLeadGroup = {
  lead_key: string;
  lead_label: string;
  items: PayrollReviewLineItem[];
};

export function leadMatchKey(item: { lead_phone: string | null; lead_name: string | null }): string {
  const phone = normalizePhone(item.lead_phone);
  if (phone.length >= 7) return `phone:${phone}`;
  const name = item.lead_name?.trim().toLowerCase();
  if (name) return `name:${name}`;
  return '';
}

export function formatLeadLabel(item: PayrollReviewLineItem): string {
  const name = item.lead_name?.trim();
  const phone = item.lead_phone?.trim();
  if (name && phone) return `${name} (${phone})`;
  return name || phone || 'Unknown lead';
}

export function detectDuplicateLeadGroups(items: PayrollReviewLineItem[]): DuplicateLeadGroup[] {
  const byLead = new Map<string, PayrollReviewLineItem[]>();

  for (const item of items) {
    const key = leadMatchKey(item);
    if (!key) continue;
    const list = byLead.get(key) ?? [];
    list.push(item);
    byLead.set(key, list);
  }

  return [...byLead.entries()]
    .filter(([, groupItems]) => groupItems.length >= 2)
    .map(([lead_key, groupItems]) => ({
      lead_key,
      lead_label: formatLeadLabel(groupItems[0]),
      items: [...groupItems].sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type)),
    }))
    .sort((a, b) => a.lead_label.localeCompare(b.lead_label));
}

export function duplicateEventIds(groups: DuplicateLeadGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) ids.add(item.event_id);
  }
  return ids;
}

export function exclusionsToMap(exclusions: LineItemExclusion[]): Map<string, string> {
  return new Map(exclusions.map(e => [e.event_id, e.reason]));
}

export function applyCallRepExclusions(
  row: AgentCommissionRow,
  exclusions: LineItemExclusion[],
): { counts: AgentCommissionRow['counts']; amounts: AgentCommissionRow['amounts'] } {
  const excluded = exclusionsToMap(exclusions);
  const active = row.line_items.filter(item => !excluded.has(item.event_id));
  const counts = {
    bookings: active.filter(item => item.type === 'booking').length,
    shows: active.filter(item => item.type === 'show').length,
    live_transfers: active.filter(item => item.type === 'live_transfer').length,
  };
  const amounts = {
    base: row.amounts.base,
    bonus: row.amounts.bonus,
    bookings: counts.bookings * row.rates.pay_per_booking,
    shows: counts.shows * row.rates.pay_per_show,
    live_transfers: counts.live_transfers * row.rates.pay_per_live_transfer,
    total: 0,
  };
  amounts.total = amounts.base + amounts.bonus + amounts.bookings + amounts.shows + amounts.live_transfers;
  return { counts, amounts };
}

export function applyB2BSetterExclusions(
  row: B2BSetterCommissionRow,
  exclusions: LineItemExclusion[],
): { counts: B2BSetterCommissionRow['counts']; amounts: B2BSetterCommissionRow['amounts'] } {
  const excluded = exclusionsToMap(exclusions);
  const active = row.line_items.filter(item => !excluded.has(item.event_id));
  const counts = {
    qualified_demos: active.filter(item => item.type === 'qualified_demo').length,
    closes: active.filter(item => item.type === 'close').length,
  };
  const amounts = {
    base: row.amounts.base,
    bonus: row.amounts.bonus,
    qualified_demos: counts.qualified_demos * row.rates.pay_per_qualified_demo,
    closes: counts.closes * row.rates.pay_per_close,
    total: 0,
  };
  amounts.total = amounts.base + amounts.bonus + amounts.qualified_demos + amounts.closes;
  return { counts, amounts };
}

export function applyPayrollExclusions(
  section: 'call_rep' | 'b2b_setter',
  row: AgentCommissionRow | B2BSetterCommissionRow,
  exclusions: LineItemExclusion[],
): { counts: Record<string, number>; amounts: Record<string, number>; total_pay: number } {
  if (section === 'call_rep') {
    const result = applyCallRepExclusions(row as AgentCommissionRow, exclusions);
    return { counts: result.counts, amounts: result.amounts, total_pay: result.amounts.total };
  }
  const result = applyB2BSetterExclusions(row as B2BSetterCommissionRow, exclusions);
  return { counts: result.counts, amounts: result.amounts, total_pay: result.amounts.total };
}
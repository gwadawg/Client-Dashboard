/** Rules for identifying incomplete acquisition closes (backfill / data quality). */

export type CloseCompletenessStatus = 'complete' | 'needs_review' | 'critical';

export type CloseCompletenessInput = {
  lead_id?: string | null;
  offer_id?: string | null;
  client_id?: string | null;
  mapping_status?: string | null;
  cash_collected?: number | null;
  offer_type?: string | null;
  reporting_type?: string | null;
  setter_name?: string | null;
  offered_by?: string | null;
  call_id?: string | null;
  has_closer_form?: boolean;
  offer_is_closed?: boolean | null;
};

export type CloseCompleteness = {
  status: CloseCompletenessStatus;
  missing_fields: string[];
  missing_count: number;
};

export const CLOSE_FIELD_LABELS: Record<string, string> = {
  lead_id: 'Lead',
  client_id: 'Client roster',
  cash_collected: 'Cash collected',
  offer_type: 'Offer type',
  reporting_type: 'Reporting type',
  attribution: 'Setter or closer',
  call_documentation: 'Closer form / call',
  offer_linkage: 'Offer marked closed',
};

const CRITICAL_FIELDS = new Set(['lead_id', 'client_id', 'cash_collected', 'offer_type']);
const IMPORTANT_FIELDS = new Set(['attribution', 'call_documentation', 'offer_linkage', 'reporting_type']);

export function assessCloseCompleteness(input: CloseCompletenessInput): CloseCompleteness {
  if (input.mapping_status === 'dismissed') {
    return { status: 'complete', missing_fields: [], missing_count: 0 };
  }

  const missing: string[] = [];

  if (!input.lead_id) missing.push('lead_id');

  if (input.mapping_status === 'pending_client' && !input.client_id) {
    missing.push('client_id');
  }

  if (input.cash_collected == null) missing.push('cash_collected');
  if (!input.offer_type?.trim()) missing.push('offer_type');

  const hasAttribution = !!(input.setter_name?.trim() || input.offered_by?.trim());
  if (!hasAttribution) missing.push('attribution');

  const hasCallDoc = !!(input.call_id || input.has_closer_form);
  if (!hasCallDoc) missing.push('call_documentation');

  if (input.offer_id && input.offer_is_closed === false) missing.push('offer_linkage');

  if (!input.reporting_type?.trim()) missing.push('reporting_type');

  const hasCritical = missing.some(f => CRITICAL_FIELDS.has(f));
  const hasImportant = missing.some(f => IMPORTANT_FIELDS.has(f));

  let status: CloseCompletenessStatus = 'complete';
  if (hasCritical) status = 'critical';
  else if (hasImportant) status = 'needs_review';

  return {
    status,
    missing_fields: missing,
    missing_count: missing.length,
  };
}

export function isCloseIncomplete(completeness: CloseCompleteness): boolean {
  return completeness.status !== 'complete';
}

export type CloseFilterMode =
  | 'all'
  | 'incomplete'
  | 'pending_client'
  | 'missing_cash'
  | 'excluded';

export function matchesCloseFilter(
  row: CloseCompletenessInput & { completeness?: CloseCompleteness },
  mode: CloseFilterMode,
): boolean {
  if (mode === 'all') return true;
  if (mode === 'excluded') return row.mapping_status === 'dismissed';
  if (mode === 'pending_client') {
    return row.mapping_status === 'pending_client' && !row.client_id;
  }
  if (mode === 'missing_cash') return row.cash_collected == null;
  const c = row.completeness ?? assessCloseCompleteness(row);
  return isCloseIncomplete(c);
}

import { createServiceClient } from './supabase';
import { normalizeReportingType } from './reporting-types';

// Sentinel used when filtering to live clients but none exist — guarantees empty results
// without crashing Supabase's IN() clause.
const NO_MATCH = '__no_match__';

export async function getLiveClientIds(
  service: ReturnType<typeof createServiceClient>
): Promise<string[]> {
  const { data } = await service.from('clients').select('id').eq('is_live', true);
  return (data ?? []).map(c => c.id);
}

export async function getClientIdsByReportingType(
  service: ReturnType<typeof createServiceClient>,
  reportingType: string,
): Promise<string[]> {
  const normalized = normalizeReportingType(reportingType);
  const { data } = await service.from('clients').select('id').eq('reporting_type', normalized);
  const ids = (data ?? []).map(c => c.id);
  if (normalized === 'CALL_CENTER') {
    const { data: legacy } = await service.from('clients').select('id').eq('reporting_type', 'HE');
    for (const row of legacy ?? []) {
      if (!ids.includes(row.id)) ids.push(row.id);
    }
  }
  return ids;
}

// Returns the IDs to pass to `.in('client_id', ...)`, or the no-match sentinel if empty.
export function liveClientFilter(ids: string[]): string[] {
  return ids.length > 0 ? ids : [NO_MATCH];
}

/** Intersect two client-id lists; empty intersection → no-match sentinel. */
export function intersectClientFilters(a: string[] | null, b: string[] | null): string[] | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const set = new Set(b);
  const out = a.filter(id => set.has(id));
  return out.length > 0 ? out : [NO_MATCH];
}

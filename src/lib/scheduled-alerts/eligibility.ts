import type { SupabaseClient } from '@supabase/supabase-js';
import { usesCallCenterKpiLayout, normalizeReportingType } from '@/lib/kpi-layouts';

export type EligibleClientRow = {
  id: string;
  name: string;
  reporting_type: string | null;
};

export type PaidAdsEligibilityOpts = {
  excludeCallCenter?: boolean;
};

/** Active + live clients, optionally excluding call-center / HE layouts. */
export async function getEligiblePaidAdsClients(
  service: SupabaseClient,
  opts: PaidAdsEligibilityOpts = { excludeCallCenter: true },
): Promise<EligibleClientRow[]> {
  const { data: clients, error } = await service
    .from('clients')
    .select('id, name, is_live, lifecycle_status, reporting_type')
    .eq('is_live', true)
    .eq('lifecycle_status', 'active')
    .order('name');

  if (error) throw new Error(error.message);

  return (clients ?? [])
    .filter(c => {
      if (opts.excludeCallCenter) {
        const rt = normalizeReportingType(c.reporting_type);
        if (usesCallCenterKpiLayout(rt)) return false;
      }
      return true;
    })
    .map(c => ({
      id: c.id as string,
      name: String(c.name),
      reporting_type: (c.reporting_type as string | null) ?? null,
    }));
}

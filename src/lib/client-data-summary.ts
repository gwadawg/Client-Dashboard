import type { SupabaseClient } from '@supabase/supabase-js';

export type ClientDataSummary = {
  events: number;
  client_billings: number;
  client_calls: number;
  client_notes: number;
  ad_spend: number;
  meta_ad_insights: number;
  total_rows: number;
};

const COUNT_TABLES = [
  'events',
  'client_billings',
  'client_calls',
  'client_notes',
  'ad_spend',
  'meta_ad_insights',
  'client_action_logs',
  'client_status_history',
  'client_attributes',
] as const;

export async function getClientDataSummary(
  service: SupabaseClient,
  clientId: string,
): Promise<ClientDataSummary> {
  const counts = await Promise.all(
    COUNT_TABLES.map(async table => {
      const { count, error } = await service
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId);
      if (error) throw new Error(`${table}: ${error.message}`);
      return [table, count ?? 0] as const;
    }),
  );

  const byTable = Object.fromEntries(counts) as Record<(typeof COUNT_TABLES)[number], number>;
  const total_rows = counts.reduce((sum, [, n]) => sum + n, 0);

  return {
    events: byTable.events ?? 0,
    client_billings: byTable.client_billings ?? 0,
    client_calls: byTable.client_calls ?? 0,
    client_notes: byTable.client_notes ?? 0,
    ad_spend: byTable.ad_spend ?? 0,
    meta_ad_insights: byTable.meta_ad_insights ?? 0,
    total_rows,
  };
}

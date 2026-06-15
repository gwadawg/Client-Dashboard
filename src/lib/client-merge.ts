import type { SupabaseClient } from '@supabase/supabase-js';

const MERGE_TABLES = [
  'events',
  'client_billings',
  'client_calls',
  'client_notes',
  'ad_spend',
  'meta_ad_insights',
  'client_action_logs',
  'client_status_history',
  'client_attributes',
  'client_monthly_snapshots',
  'client_health_snapshots',
  'client_calling_windows',
  'client_mrr_history',
  'billing_reminder_log',
] as const;

async function dedupeConflicts(service: SupabaseClient, sourceId: string, targetId: string) {
  const { data: targetAdSpend } = await service
    .from('ad_spend')
    .select('spend_date, platform')
    .eq('client_id', targetId);
  const { data: sourceAdSpend } = await service
    .from('ad_spend')
    .select('id, spend_date, platform')
    .eq('client_id', sourceId);
  const adKeys = new Set((targetAdSpend ?? []).map(r => `${r.spend_date}\0${r.platform}`));
  const adDupIds = (sourceAdSpend ?? [])
    .filter(r => adKeys.has(`${r.spend_date}\0${r.platform}`))
    .map(r => r.id);
  if (adDupIds.length) {
    const { error } = await service.from('ad_spend').delete().in('id', adDupIds);
    if (error) throw new Error(`ad_spend dedupe: ${error.message}`);
  }

  const { data: targetInsights } = await service
    .from('meta_ad_insights')
    .select('insight_date, account_id, campaign_id, adset_id, ad_id')
    .eq('client_id', targetId);
  const { data: sourceInsights } = await service
    .from('meta_ad_insights')
    .select('id, insight_date, account_id, campaign_id, adset_id, ad_id')
    .eq('client_id', sourceId);
  const insightKeys = new Set(
    (targetInsights ?? []).map(
      r => `${r.insight_date}\0${r.account_id}\0${r.campaign_id}\0${r.adset_id}\0${r.ad_id}`,
    ),
  );
  const insightDupIds = (sourceInsights ?? [])
    .filter(r =>
      insightKeys.has(
        `${r.insight_date}\0${r.account_id}\0${r.campaign_id}\0${r.adset_id}\0${r.ad_id}`,
      ),
    )
    .map(r => r.id);
  if (insightDupIds.length) {
    const { error } = await service.from('meta_ad_insights').delete().in('id', insightDupIds);
    if (error) throw new Error(`meta_ad_insights dedupe: ${error.message}`);
  }

  const { data: targetMonths } = await service
    .from('client_monthly_snapshots')
    .select('period_month')
    .eq('client_id', targetId);
  const months = (targetMonths ?? []).map(r => r.period_month);
  if (months.length) {
    const { error } = await service
      .from('client_monthly_snapshots')
      .delete()
      .eq('client_id', sourceId)
      .in('period_month', months);
    if (error) throw new Error(`client_monthly_snapshots dedupe: ${error.message}`);
  }

  const { data: targetAttrs } = await service
    .from('client_attributes')
    .select('attr_key')
    .eq('client_id', targetId);
  const attrKeys = (targetAttrs ?? []).map(r => r.attr_key);
  if (attrKeys.length) {
    const { error } = await service
      .from('client_attributes')
      .delete()
      .eq('client_id', sourceId)
      .in('attr_key', attrKeys);
    if (error) throw new Error(`client_attributes dedupe: ${error.message}`);
  }
}

export async function mergeClients(
  service: SupabaseClient,
  sourceId: string,
  targetId: string,
): Promise<{ moved_tables: string[]; source_name: string; target_name: string }> {
  if (sourceId === targetId) throw new Error('source and target must be different clients');

  const [{ data: source }, { data: target }] = await Promise.all([
    service.from('clients').select('id, name').eq('id', sourceId).maybeSingle(),
    service.from('clients').select('id, name').eq('id', targetId).maybeSingle(),
  ]);
  if (!source) throw new Error('Source client not found');
  if (!target) throw new Error('Target client not found');

  await dedupeConflicts(service, sourceId, targetId);

  const moved_tables: string[] = [];
  for (const table of MERGE_TABLES) {
    const { error } = await service.from(table).update({ client_id: targetId }).eq('client_id', sourceId);
    if (error) throw new Error(`${table}: ${error.message}`);
    moved_tables.push(table);
  }

  const { error: deleteErr } = await service.from('clients').delete().eq('id', sourceId);
  if (deleteErr) throw new Error(deleteErr.message);

  return { moved_tables, source_name: source.name, target_name: target.name };
}

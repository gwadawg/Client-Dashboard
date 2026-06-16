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
  'pd_schedule',
  'client_contacts',
  'client_form_submissions',
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

  const { data: targetPd } = await service
    .from('pd_schedule')
    .select('scheduled_date, slot_time, agent_id')
    .eq('client_id', targetId);
  const { data: sourcePd } = await service
    .from('pd_schedule')
    .select('id, scheduled_date, slot_time, agent_id')
    .eq('client_id', sourceId);
  const pdKeys = new Set(
    (targetPd ?? []).map(r => `${r.scheduled_date}\0${r.slot_time}\0${r.agent_id ?? ''}`),
  );
  const pdDupIds = (sourcePd ?? [])
    .filter(r => pdKeys.has(`${r.scheduled_date}\0${r.slot_time}\0${r.agent_id ?? ''}`))
    .map(r => r.id);
  if (pdDupIds.length) {
    const { error } = await service.from('pd_schedule').delete().in('id', pdDupIds);
    if (error) throw new Error(`pd_schedule dedupe: ${error.message}`);
  }

  const { data: targetContacts } = await service
    .from('client_contacts')
    .select('contact_type, name')
    .eq('client_id', targetId);
  const { data: sourceContacts } = await service
    .from('client_contacts')
    .select('id, contact_type, name')
    .eq('client_id', sourceId);
  const contactKeys = new Set(
    (targetContacts ?? []).map(r => `${r.contact_type}\0${r.name.toLowerCase()}`),
  );
  const contactDupIds = (sourceContacts ?? [])
    .filter(r => contactKeys.has(`${r.contact_type}\0${r.name.toLowerCase()}`))
    .map(r => r.id);
  if (contactDupIds.length) {
    const { error } = await service.from('client_contacts').delete().in('id', contactDupIds);
    if (error) throw new Error(`client_contacts dedupe: ${error.message}`);
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

  const { error: pendingErr } = await service
    .from('pending_events')
    .update({ resolved_client_id: targetId })
    .eq('resolved_client_id', sourceId);
  if (pendingErr) throw new Error(`pending_events: ${pendingErr.message}`);
  moved_tables.push('pending_events.resolved_client_id');

  const { error: deleteErr } = await service.from('clients').delete().eq('id', sourceId);
  if (deleteErr) throw new Error(deleteErr.message);

  return { moved_tables, source_name: source.name, target_name: target.name };
}

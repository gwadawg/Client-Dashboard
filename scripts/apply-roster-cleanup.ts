/**
 * Apply approved roster cleanup actions (dry-run by default).
 *
 *   npx tsx scripts/apply-roster-cleanup.ts
 *   npx tsx scripts/apply-roster-cleanup.ts --apply
 *   npx tsx scripts/apply-roster-cleanup.ts --approval data/import/roster-cleanup-approved.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mergeClients } from '../src/lib/client-merge';
import { syncIsLiveWithLifecycle } from '../src/lib/lifecycle-sync';
import { replayPendingForClientId } from '../src/lib/pending-events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const forceReview = args.includes('--force');
const approvalPath =
  args.find((a, i) => args[i - 1] === '--approval') ||
  resolve(__dirname, '../data/import/roster-cleanup-approved.json');

const PROFILE_FIELDS = [
  'ghl_location_id',
  'clickup_task_id',
  'primary_contact_name',
  'email',
  'billing_email',
  'phone',
  'mrr',
  'billing_type',
  'billing_day',
  'launch_date',
  'date_signed',
] as const;

function loadEnv() {
  return Object.fromEntries(
    readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
      .split('\n')
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

function createService(): SupabaseClient {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env in .env.local');
  return createClient(url, key, { auth: { persistSession: false } });
}

type Approval = {
  merges?: { source_id: string; target_id: string; reason?: string }[];
  deletes?: string[];
  payment_moves?: {
    billing_id: string;
    from_client_id: string;
    to_client_id: string;
    reason?: string;
  }[];
  name_map_additions?: Record<string, string>;
  status_fixes?: { client_id: string; lifecycle_status?: string; is_live?: boolean }[];
};

const FOOTPRINT_TABLES = [
  'events',
  'client_billings',
  'client_calls',
  'client_notes',
  'ad_spend',
  'meta_ad_insights',
  'client_action_logs',
  'client_status_history',
  'client_attributes',
  'client_health_snapshots',
  'client_monthly_snapshots',
  'client_calling_windows',
  'client_mrr_history',
  'billing_reminder_log',
  'pd_schedule',
  'client_contacts',
  'client_form_submissions',
];

async function snapshotState(service: SupabaseClient) {
  const snap: Record<string, number> = {};
  const { count: clientCount } = await service
    .from('clients')
    .select('*', { count: 'exact', head: true });
  snap.clients = clientCount ?? 0;
  for (const table of FOOTPRINT_TABLES) {
    const { count } = await service.from(table).select('*', { count: 'exact', head: true });
    snap[table] = count ?? 0;
  }
  return snap;
}

async function clientFootprint(service: SupabaseClient, clientId: string) {
  let total = 0;
  for (const table of FOOTPRINT_TABLES) {
    const { count } = await service
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId);
    total += count ?? 0;
  }
  return total;
}

const UNIQUE_PROFILE_FIELDS = ['ghl_location_id', 'clickup_task_id'] as const;

async function enrichTargetFromSource(
  service: SupabaseClient,
  sourceId: string,
  targetId: string,
  dryRun: boolean,
) {
  const [{ data: source }, { data: target }] = await Promise.all([
    service.from('clients').select(PROFILE_FIELDS.join(',')).eq('id', sourceId).maybeSingle(),
    service.from('clients').select(PROFILE_FIELDS.join(',')).eq('id', targetId).maybeSingle(),
  ]);
  if (!source || !target) return null;

  const patch: Record<string, unknown> = {};
  const sourceClear: Record<string, null> = {};
  for (const field of PROFILE_FIELDS) {
    const tVal = target[field as keyof typeof target];
    const sVal = source[field as keyof typeof source];
    if ((tVal == null || tVal === '' || (field === 'mrr' && Number(tVal) === 0)) && sVal != null && sVal !== '') {
      patch[field] = sVal;
      if ((UNIQUE_PROFILE_FIELDS as readonly string[]).includes(field)) {
        sourceClear[field] = null;
      }
    }
  }
  if (!Object.keys(patch).length) return null;
  if (!dryRun) {
    if (Object.keys(sourceClear).length) {
      const { error: clearErr } = await service.from('clients').update(sourceClear).eq('id', sourceId);
      if (clearErr) throw new Error(`clear source ${sourceId}: ${clearErr.message}`);
    }
    const { error } = await service.from('clients').update(patch).eq('id', targetId);
    if (error) throw new Error(`enrich target ${targetId}: ${error.message}`);
  }
  return patch;
}

async function main() {
  if (!existsSync(approvalPath)) {
    console.error(`Approval file not found: ${approvalPath}`);
    console.error('Run audit-client-roster.mjs first and edit roster-cleanup-approved.json');
    process.exit(1);
  }

  const approval: Approval = JSON.parse(readFileSync(approvalPath, 'utf-8'));
  const service = createService();
  const log: Record<string, unknown> = {
    mode: applyMode ? 'apply' : 'dry-run',
    approval_path: approvalPath,
    started_at: new Date().toISOString(),
    actions: [] as unknown[],
  };

  console.log(applyMode ? 'APPLY MODE — writing changes' : 'DRY RUN — no writes');
  console.log(`Approval: ${approvalPath}`);

  const preSnap = await snapshotState(service);
  log.pre_snapshot = preSnap;

  const merges = (approval.merges ?? []).filter(m => forceReview || !(m as { _review?: boolean })._review);
  const paymentMoves = approval.payment_moves ?? [];
  const deletes = approval.deletes ?? [];
  const statusFixes = approval.status_fixes ?? [];

  for (const merge of merges) {
    const action: Record<string, unknown> = { type: 'merge', ...merge };
    if (applyMode) {
      const enrich = await enrichTargetFromSource(service, merge.source_id, merge.target_id, false);
      if (enrich) action.enriched_target = enrich;
      const result = await mergeClients(service, merge.source_id, merge.target_id);
      Object.assign(action, result);
      const replay = await replayPendingForClientId(service, merge.target_id);
      action.pending_replay = replay;
    } else {
      const { data: source } = await service
        .from('clients')
        .select('id, name')
        .eq('id', merge.source_id)
        .maybeSingle();
      const { data: target } = await service
        .from('clients')
        .select('id, name')
        .eq('id', merge.target_id)
        .maybeSingle();
      action.would_merge = `${source?.name ?? merge.source_id} → ${target?.name ?? merge.target_id}`;
      action.enrich_preview = await enrichTargetFromSource(
        service,
        merge.source_id,
        merge.target_id,
        true,
      );
    }
    (log.actions as unknown[]).push(action);
    console.log(applyMode ? `Merged: ${JSON.stringify(action)}` : `Would merge: ${action.would_merge}`);
  }

  for (const move of paymentMoves) {
    const action = { type: 'payment_move', ...move };
    if (applyMode) {
      const { error } = await service
        .from('client_billings')
        .update({ client_id: move.to_client_id })
        .eq('id', move.billing_id)
        .eq('client_id', move.from_client_id);
      if (error) throw new Error(`payment move ${move.billing_id}: ${error.message}`);
    }
    (log.actions as unknown[]).push(action);
    console.log(
      applyMode
        ? `Moved billing ${move.billing_id} → ${move.to_client_id}`
        : `Would move billing ${move.billing_id} from ${move.from_client_id} to ${move.to_client_id}`,
    );
  }

  for (const clientId of deletes) {
    const fp = await clientFootprint(service, clientId);
    const { data: client } = await service
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .maybeSingle();
    const action: Record<string, unknown> = { type: 'delete', client_id: clientId, name: client?.name, footprint: fp };
    if (fp > 0) {
      action.blocked = true;
      action.reason = 'client still has related data — merge first';
      console.warn(`BLOCKED delete ${client?.name}: ${fp} related rows`);
    } else if (applyMode) {
      const { error } = await service.from('clients').delete().eq('id', clientId);
      if (error) throw new Error(`delete ${clientId}: ${error.message}`);
      action.deleted = true;
      console.log(`Deleted orphan: ${client?.name}`);
    } else {
      console.log(`Would delete orphan: ${client?.name ?? clientId}`);
    }
    (log.actions as unknown[]).push(action);
  }

  for (const fix of statusFixes) {
    const action = { type: 'status_fix', ...fix };
    const patch: Record<string, unknown> = {};
    if (fix.lifecycle_status) patch.lifecycle_status = fix.lifecycle_status;
    const isLive =
      fix.is_live ?? syncIsLiveWithLifecycle(fix.lifecycle_status, undefined);
    if (isLive !== undefined) patch.is_live = isLive;

    if (applyMode && Object.keys(patch).length) {
      const { error } = await service.from('clients').update(patch).eq('id', fix.client_id);
      if (error) throw new Error(`status fix ${fix.client_id}: ${error.message}`);
    }
    (log.actions as unknown[]).push(action);
    console.log(
      applyMode
        ? `Status fix ${fix.client_id}: ${JSON.stringify(patch)}`
        : `Would status fix ${fix.client_id}: ${JSON.stringify(patch)}`,
    );
  }

  if (approval.name_map_additions && Object.keys(approval.name_map_additions).length) {
    log.name_map_note =
      'Update NAME_MAP in scripts/import-revenue.mjs and re-run revenue import SQL separately';
    console.log(
      'Name map additions recorded — re-run: node scripts/import-revenue.mjs "/path/to/Revenue.csv" > scripts/out/revenue-import.sql',
    );
  }

  const postSnap = applyMode ? await snapshotState(service) : null;
  if (postSnap) log.post_snapshot = postSnap;
  log.finished_at = new Date().toISOString();

  const outDir = resolve(__dirname, '../data/import');
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(
    outDir,
    applyMode ? 'roster-cleanup-applied.json' : 'roster-cleanup-dry-run.json',
  );
  writeFileSync(outFile, JSON.stringify(log, null, 2) + '\n');
  console.log(`Log: ${outFile}`);

  if (!applyMode) {
    console.log('\nTo apply: npx tsx scripts/apply-roster-cleanup.ts --apply');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

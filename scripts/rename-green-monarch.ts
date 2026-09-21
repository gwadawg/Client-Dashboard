/**
 * Rename Dave Bancroft's Office → Green Monarch Inc across roster + related text.
 *
 * Events stay linked by client_id (no remapping needed). Webhook name
 * "Dave Bancroft's Office" continues to resolve via CLIENT_NAME_ALIASES.
 *
 *   npx tsx scripts/rename-green-monarch.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_ID = '82b01426-781b-4e43-b89b-c94bcafd1d5a';
const ACCOUNT_GROUP_ID = 'dc5dc3f6-3425-42a3-971c-f0a78108cb96';
const CANONICAL = 'Green Monarch Inc';
const OLD_GHL_NAME = "Dave Bancroft's Office";

function loadEnv() {
  return Object.fromEntries(
    readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

async function main() {
  const env = loadEnv();
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const actions: string[] = [];

  const { data: before, error: beforeErr } = await service
    .from('clients')
    .select(
      'id, name, primary_contact_name, brokerage_name, legal_business_name, ghl_location_id, account_group_id',
    )
    .eq('id', CLIENT_ID)
    .single();
  if (beforeErr || !before) throw new Error(beforeErr?.message ?? 'client not found');

  const clientPatch: Record<string, unknown> = {};
  if (before.name !== CANONICAL) clientPatch.name = CANONICAL;
  if (!before.brokerage_name) clientPatch.brokerage_name = CANONICAL;
  if (!before.legal_business_name) clientPatch.legal_business_name = CANONICAL;
  if (before.primary_contact_name === 'Dave Bamcroft') {
    clientPatch.primary_contact_name = 'Dave Bancroft';
  }

  if (Object.keys(clientPatch).length) {
    const { error } = await service.from('clients').update(clientPatch).eq('id', CLIENT_ID);
    if (error) throw new Error(`clients update: ${error.message}`);
    actions.push(`clients: ${JSON.stringify(clientPatch)}`);
  } else {
    actions.push('clients: already canonical');
  }

  const { data: ag } = await service
    .from('client_account_groups')
    .select('id, display_name')
    .eq('id', ACCOUNT_GROUP_ID)
    .maybeSingle();
  if (ag && (ag.display_name === 'Dave Bamcroft' || ag.display_name === OLD_GHL_NAME)) {
    const { error } = await service
      .from('client_account_groups')
      .update({ display_name: 'Dave Bancroft' })
      .eq('id', ACCOUNT_GROUP_ID);
    if (error) throw new Error(`account group: ${error.message}`);
    actions.push(`account_group display_name: "${ag.display_name}" → "Dave Bancroft"`);
  } else if (ag) {
    actions.push(`account_group display_name unchanged: "${ag.display_name}"`);
  }

  const { data: pendingRows, error: pendErr } = await service
    .from('pending_events')
    .select('id, client_name, status')
    .eq('client_name', OLD_GHL_NAME);
  if (pendErr) throw new Error(`pending select: ${pendErr.message}`);

  if (pendingRows?.length) {
    const { error } = await service
      .from('pending_events')
      .update({ client_name: CANONICAL })
      .eq('client_name', OLD_GHL_NAME);
    if (error) throw new Error(`pending update: ${error.message}`);
    actions.push(`pending_events: renamed ${pendingRows.length} row(s) → "${CANONICAL}"`);
  } else {
    actions.push('pending_events: none with old name');
  }

  // Ensure no duplicate client still named Green Monarch / Dave Bancroft
  const { data: dupes } = await service
    .from('clients')
    .select('id, name')
    .or(`name.ilike.%green monarch%,name.ilike.%bancroft%`);
  const other = (dupes ?? []).filter((c) => c.id !== CLIENT_ID);
  if (other.length) {
    actions.push(`WARNING other name matches: ${JSON.stringify(other)}`);
  }

  const { data: after } = await service
    .from('clients')
    .select(
      'id, name, primary_contact_name, brokerage_name, legal_business_name, ghl_location_id',
    )
    .eq('id', CLIENT_ID)
    .single();

  const { count: eventCount } = await service
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', CLIENT_ID);

  const report = {
    generated_at: new Date().toISOString(),
    before,
    after,
    event_count_unchanged: eventCount,
    actions,
    note:
      'Historical events keep client_id linkage. raw.client_name still shows what GHL/Make sent (mostly "Green Monarch inc"). Webhook alias maps "Dave Bancroft\'s Office" → Green Monarch Inc until GHL is renamed.',
  };

  const outDir = resolve(__dirname, '../data/import');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'rename-green-monarch-2026-09-21.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Repair identity_client_id links for clients that share an account_group_id.
 * Only updates the identity_client_id column on non-root offer rows — no billings,
 * events, calls, notes, or profile fields are touched.
 *
 *   npx tsx scripts/repair-account-identity-links.ts
 *   npx tsx scripts/repair-account-identity-links.ts --apply
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  syncIdentityLinksForAccountGroup,
  type IdentityLinkRepair,
} from '../src/lib/account-identity-sync';
import { pickAccountIdentityRootId } from '../src/lib/client-identity';

const __dirname = dirname(fileURLToPath(import.meta.url));
const applyMode = process.argv.includes('--apply');

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

async function main() {
  const service = createService();

  const { data: groups, error } = await service
    .from('client_account_groups')
    .select('id, display_name')
    .order('display_name');
  if (error) throw new Error(error.message);

  const preview: Array<{
    account_group_id: string;
    display_name: string;
    root_id: string | null;
    repairs: IdentityLinkRepair[];
  }> = [];

  for (const group of groups ?? []) {
    const { data: siblings, error: sibErr } = await service
      .from('clients')
      .select('id, identity_client_id, engagement_kind, created_at, name')
      .eq('account_group_id', group.id)
      .order('created_at', { ascending: true });
    if (sibErr) throw new Error(sibErr.message);
    if (!siblings || siblings.length <= 1) continue;

    const rootId = pickAccountIdentityRootId(siblings);
    const repairs: IdentityLinkRepair[] = [];
    for (const row of siblings) {
      if (!rootId || row.id === rootId) continue;
      const current = row.identity_client_id ?? null;
      if (current === rootId) continue;
      repairs.push({
        client_id: row.id,
        previous_identity_client_id: current,
        identity_client_id: rootId,
      });
    }

    if (repairs.length) {
      preview.push({
        account_group_id: group.id,
        display_name: group.display_name,
        root_id: rootId,
        repairs,
      });
    }
  }

  const outDir = resolve(__dirname, '../data/import');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'account-identity-link-repair-preview.json');
  writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), preview }, null, 2));

  console.log(`Account groups scanned: ${groups?.length ?? 0}`);
  console.log(`Groups needing identity link repair: ${preview.length}`);
  console.log(`Preview written: ${outPath}`);

  for (const row of preview) {
    console.log(`\n${row.display_name} (${row.account_group_id}) → root ${row.root_id}`);
    for (const r of row.repairs) {
      console.log(
        `  ${r.client_id}: identity_client_id ${r.previous_identity_client_id ?? 'null'} → ${r.identity_client_id}`,
      );
    }
  }

  if (!applyMode) {
    console.log('\nDry run only. Re-run with --apply to write identity_client_id links.');
    return;
  }

  let applied = 0;
  for (const row of preview) {
    const repairs = await syncIdentityLinksForAccountGroup(service, row.account_group_id);
    applied += repairs.length;
  }

  console.log(`\nApplied ${applied} identity_client_id repair(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

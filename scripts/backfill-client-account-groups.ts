/**
 * Backfill client_account_groups for existing clients.
 *
 *   npx tsx scripts/backfill-client-account-groups.ts
 *   npx tsx scripts/backfill-client-account-groups.ts --apply
 *
 * Without --apply, prints a dry-run summary and collision report.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { accountDisplayName } from '../src/lib/client-account-groups';

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

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  primary_contact_name: string | null;
  primary_contact: string | null;
  account_group_id: string | null;
};

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const v = email.trim().toLowerCase();
  return v || null;
}

function groupKey(c: ClientRow): string {
  const email = normalizeEmail(c.email);
  const name = accountDisplayName(c).toLowerCase();
  return email ? `${name}|${email}` : `${name}|__no_email__`;
}

async function main() {
  const service = createService();
  const { data: clients, error } = await service
    .from('clients')
    .select('id, name, email, primary_contact_name, primary_contact, account_group_id')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (clients ?? []) as ClientRow[];
  const unlinked = rows.filter(c => !c.account_group_id);
  const buckets = new Map<string, ClientRow[]>();

  for (const c of unlinked) {
    const key = groupKey(c);
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  const collisions: { name: string; clients: { id: string; email: string | null; name: string }[] }[] = [];
  const singletonKeys = new Set<string>();
  const mergeGroups: { key: string; clientIds: string[]; display_name: string; email: string | null }[] = [];

  for (const [key, members] of buckets) {
    if (members.length === 1) {
      singletonKeys.add(key);
      continue;
    }
    const emails = new Set(members.map(m => normalizeEmail(m.email)).filter(Boolean));
    if (emails.size > 1) {
      collisions.push({
        name: accountDisplayName(members[0]),
        clients: members.map(m => ({ id: m.id, email: m.email, name: m.name })),
      });
      for (const m of members) singletonKeys.add(`${groupKey(m)}::${m.id}`);
      continue;
    }
    mergeGroups.push({
      key,
      clientIds: members.map(m => m.id),
      display_name: accountDisplayName(members[0]),
      email: normalizeEmail(members[0].email),
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    total_clients: rows.length,
    already_linked: rows.length - unlinked.length,
    to_process: unlinked.length,
    merge_groups: mergeGroups.length,
    singletons: singletonKeys.size + (unlinked.length - mergeGroups.reduce((s, g) => s + g.clientIds.length, 0) - collisions.reduce((s, c) => s + c.clients.length, 0)),
    collisions,
    merge_groups_detail: mergeGroups,
  };

  const outDir = resolve(__dirname, '../data/import');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'account-groups-backfill-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Report written: ${outPath}`);
  console.log(`Unlinked: ${unlinked.length}, merge groups: ${mergeGroups.length}, collisions: ${collisions.length}`);

  if (!applyMode) {
    console.log('Dry run only. Pass --apply to write account groups.');
    return;
  }

  let groupsCreated = 0;
  let clientsLinked = 0;

  for (const g of mergeGroups) {
    const { data: group, error: gErr } = await service
      .from('client_account_groups')
      .insert({ display_name: g.display_name, primary_email: g.email })
      .select('id')
      .single();
    if (gErr || !group) throw new Error(gErr?.message ?? 'group insert failed');
    groupsCreated++;

    const sorted = g.clientIds;
    for (let i = 0; i < sorted.length; i++) {
      const patch: Record<string, unknown> = {
        account_group_id: group.id,
        engagement_kind: i === 0 ? 'initial' : 'cross_sell',
      };
      if (i > 0) patch.origin_client_id = sorted[0];
      const { error: uErr } = await service.from('clients').update(patch).eq('id', sorted[i]);
      if (uErr) throw new Error(uErr.message);
      clientsLinked++;
    }
  }

  for (const c of unlinked) {
    if (c.account_group_id) continue;
    const key = groupKey(c);
    const isCollisionSingleton = [...singletonKeys].some(k => k.startsWith(`${key}::`));
    const inMerge = mergeGroups.some(g => g.clientIds.includes(c.id));
    if (inMerge) continue;

    const displayName = isCollisionSingleton
      ? `${accountDisplayName(c)} (${c.id.slice(0, 8)})`
      : accountDisplayName(c);

    const { data: group, error: gErr } = await service
      .from('client_account_groups')
      .insert({
        display_name: displayName,
        primary_email: normalizeEmail(c.email),
      })
      .select('id')
      .single();
    if (gErr || !group) throw new Error(gErr?.message ?? 'singleton group failed');

    const { error: uErr } = await service
      .from('clients')
      .update({ account_group_id: group.id, engagement_kind: 'initial' })
      .eq('id', c.id);
    if (uErr) throw new Error(uErr.message);
    groupsCreated++;
    clientsLinked++;
  }

  console.log(`Applied: ${groupsCreated} groups, ${clientsLinked} clients linked.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

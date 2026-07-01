/**
 * Link existing roster rows that share the same LO identity (NMLS / email / phone / contact).
 *
 *   npx tsx scripts/backfill-client-identity-links.ts
 *   npx tsx scripts/backfill-client-identity-links.ts --apply
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CLIENT_IDENTITY_FIELDS,
  clientsMatchIdentity,
  countIdentityFields,
  pickIdentitySource,
  propagateIdentityFields,
  type ClientIdentityRow,
} from '../src/lib/client-identity';

const __dirname = dirname(fileURLToPath(import.meta.url));
const applyMode = process.argv.includes('--apply');

type ClientRow = ClientIdentityRow & { date_signed?: string | null };

const SELECT =
  'id, name, identity_client_id, reporting_type, offer, lifecycle_status, date_signed, ' +
  CLIENT_IDENTITY_FIELDS.join(', ');

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

class UnionFind {
  parent = new Map<string, string>();

  constructor(ids: string[]) {
    for (const id of ids) this.parent.set(id, id);
  }

  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = id;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }

  clusters(): string[][] {
    const map = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!map.has(root)) map.set(root, []);
      map.get(root)!.push(id);
    }
    return [...map.values()].filter(c => c.length > 1);
  }
}

function pickCanonicalId(members: ClientRow[]): string {
  const sorted = [...members].sort((a, b) => {
    const scoreDiff = countIdentityFields(b) - countIdentityFields(a);
    if (scoreDiff !== 0) return scoreDiff;
    const nmlsDiff = (b.nmls ? 1 : 0) - (a.nmls ? 1 : 0);
    if (nmlsDiff !== 0) return nmlsDiff;
    const activeDiff =
      (a.lifecycle_status === 'active' ? 1 : 0) - (b.lifecycle_status === 'active' ? 1 : 0);
    if (activeDiff !== 0) return activeDiff;
    const signedA = a.date_signed ? new Date(a.date_signed).getTime() : 0;
    const signedB = b.date_signed ? new Date(b.date_signed).getTime() : 0;
    return signedA - signedB;
  });
  return sorted[0]!.id;
}

type LinkPlan = {
  cluster: ClientRow[];
  canonical_id: string;
  links: { id: string; name: string; reporting_type: string | null; identity_client_id: string }[];
  identity_patch: Partial<Record<(typeof CLIENT_IDENTITY_FIELDS)[number], unknown>>;
};

function buildPlans(clients: ClientRow[]): LinkPlan[] {
  const uf = new UnionFind(clients.map(c => c.id));
  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      if (clientsMatchIdentity(clients[i]!, clients[j]!)) {
        uf.union(clients[i]!.id, clients[j]!.id);
      }
    }
  }

  const byId = new Map(clients.map(c => [c.id, c]));
  const plans: LinkPlan[] = [];

  for (const memberIds of uf.clusters()) {
    const members = memberIds.map(id => byId.get(id)!).filter(Boolean);
    const canonicalId = pickCanonicalId(members);
    const merged = pickIdentitySource(members);
    const identityPatch: LinkPlan['identity_patch'] = {};
    for (const key of CLIENT_IDENTITY_FIELDS) {
      const v = merged[key];
      if (v == null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      identityPatch[key] = v;
    }

    const links = members
      .filter(m => m.id !== canonicalId)
      .map(m => ({
        id: m.id,
        name: m.name,
        reporting_type: m.reporting_type ?? null,
        identity_client_id: canonicalId,
      }))
      .filter(m => m.id !== canonicalId);

    if (links.length) {
      plans.push({ cluster: members, canonical_id: canonicalId, links, identity_patch: identityPatch });
    }
  }

  return plans;
}

async function main() {
  const service = createService();
  const { data, error } = await service.from('clients').select(SELECT);
  if (error) throw new Error(error.message);

  const clients = (data ?? []) as unknown as ClientRow[];
  const plans = buildPlans(clients);

  const report = {
    mode: applyMode ? 'apply' : 'dry-run',
    at: new Date().toISOString(),
    clusters: plans.length,
    links: plans.reduce((n, p) => n + p.links.length, 0),
    plans: plans.map(p => ({
      canonical: {
        id: p.canonical_id,
        name: p.cluster.find(c => c.id === p.canonical_id)?.name,
      },
      members: p.cluster.map(c => ({
        id: c.id,
        name: c.name,
        reporting_type: c.reporting_type,
        nmls: c.nmls,
        email: c.email,
        phone: c.phone,
      })),
      links: p.links,
      identity_fields_to_sync: Object.keys(p.identity_patch),
    })),
    applied: [] as string[],
    errors: [] as string[],
  };

  if (applyMode) {
    for (const plan of plans) {
      for (const link of plan.links) {
        const { error: linkErr } = await service
          .from('clients')
          .update({ identity_client_id: link.identity_client_id })
          .eq('id', link.id)
          .is('identity_client_id', null);
        if (linkErr) {
          report.errors.push(`${link.id}: ${linkErr.message}`);
          continue;
        }
        report.applied.push(link.id);
      }
      if (Object.keys(plan.identity_patch).length) {
        try {
          await propagateIdentityFields(service, plan.canonical_id, plan.identity_patch);
        } catch (e) {
          report.errors.push(
            `propagate ${plan.canonical_id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }

  const outDir = resolve(__dirname, '../data/import');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(
    outDir,
    `client-identity-backfill-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ ...report, plans: report.plans.length, outPath }, null, 2));
  if (!applyMode) {
    console.log('\nDry run only. Re-run with --apply to write identity_client_id links.');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

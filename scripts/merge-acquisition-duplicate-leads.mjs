#!/usr/bin/env node
/**
 * Merge duplicate acquisition_leads that share email or phone (US last-10).
 * Repoints child rows to one canonical lead, merges fields, deletes duplicates.
 *
 * Usage:
 *   node scripts/merge-acquisition-duplicate-leads.mjs --dry-run
 *   node scripts/merge-acquisition-duplicate-leads.mjs --apply
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseRequest, fetchAll } from './lib/supabase-rest.mjs';
import { normalizeEmail, phoneDigits10 } from './lib/acquisition-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = !process.argv.includes('--apply');

const CHILD_TABLES = [
  'acquisition_appointments',
  'acquisition_offers',
  'acquisition_closes',
  'acquisition_dials',
  'acquisition_calls',
  'acquisition_form_submissions',
];

class UnionFind {
  constructor() {
    this.parent = new Map();
  }
  find(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)));
    return this.parent.get(x);
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function scoreLead(lead, childCount) {
  let s = 0;
  if (lead.converted_client_id) s += 10_000;
  s += (childCount.get(lead.id) ?? 0) * 100;
  if (lead.ghl_contact_id && lead.sheet_lead_key === lead.ghl_contact_id) s += 500;
  if (lead.ghl_contact_id) s += 50;
  if (lead.sheet_lead_key) s += 25;
  if (lead.source) s += 10;
  if (lead.email && lead.phone) s += 5;
  if (lead.lead_name) s += 2;
  // Prefer the earliest created_at (original lead).
  const created = Date.parse(lead.created_at);
  if (!Number.isNaN(created)) s -= created / 1e15;
  return s;
}

async function patch(table, id, body) {
  if (DRY_RUN) return { status: 200 };
  return supabaseRequest('PATCH', `/rest/v1/${table}?id=eq.${id}`, {
    ...body,
    updated_at: new Date().toISOString(),
  });
}

async function del(table, id) {
  if (DRY_RUN) return { status: 204 };
  return supabaseRequest('DELETE', `/rest/v1/${table}?id=eq.${id}`);
}

async function buildChildMaps() {
  const counts = new Map();
  const byLead = new Map();
  for (const table of CHILD_TABLES) {
    const rows = await fetchAll(`/rest/v1/${table}?select=id,lead_id&lead_id=not.is.null`);
    for (const row of rows) {
      counts.set(row.lead_id, (counts.get(row.lead_id) ?? 0) + 1);
      const list = byLead.get(row.lead_id) ?? [];
      list.push({ table, id: row.id });
      byLead.set(row.lead_id, list);
    }
  }
  return { counts, byLead };
}

async function repointChildren(fromId, toId, byLead, report) {
  const rows = byLead.get(fromId) ?? [];
  if (!rows.length) return;
  report.children_repointed += rows.length;
  if (DRY_RUN) return;

  for (const table of CHILD_TABLES) {
    const res = await supabaseRequest('PATCH', `/rest/v1/${table}?lead_id=eq.${fromId}`, {
      lead_id: toId,
    });
    if (res.status >= 300) {
      report.errors.push(`${table} repoint ${fromId}→${toId}: ${res.status} ${res.data}`);
    }
  }
}

function mergeLeadFields(canonical, dup, report) {
  const patch = {};
  const raw =
    canonical.raw && typeof canonical.raw === 'object' && !Array.isArray(canonical.raw)
      ? { ...canonical.raw }
      : {};
  const dupRaw =
    dup.raw && typeof dup.raw === 'object' && !Array.isArray(dup.raw) ? dup.raw : null;

  if (!canonical.lead_name && dup.lead_name) patch.lead_name = dup.lead_name;
  if (!canonical.email && dup.email) patch.email = dup.email;
  if (!canonical.phone && dup.phone) patch.phone = dup.phone;
  if (!canonical.source && dup.source) patch.source = dup.source;
  if (!canonical.ghl_contact_id && dup.ghl_contact_id) patch.ghl_contact_id = dup.ghl_contact_id;
  if (!canonical.sheet_lead_key && dup.sheet_lead_key) patch.sheet_lead_key = dup.sheet_lead_key;
  if (!canonical.offer_interest && dup.offer_interest) patch.offer_interest = dup.offer_interest;
  if (!canonical.ad_name && dup.ad_name) patch.ad_name = dup.ad_name;
  if (!canonical.ad_set && dup.ad_set) patch.ad_set = dup.ad_set;
  if (!canonical.utm_source && dup.utm_source) patch.utm_source = dup.utm_source;
  if (!canonical.utm_campaign && dup.utm_campaign) patch.utm_campaign = dup.utm_campaign;
  if (!canonical.utm_content && dup.utm_content) patch.utm_content = dup.utm_content;
  if (!canonical.qualified && dup.qualified) patch.qualified = dup.qualified;
  if (!canonical.converted_client_id && dup.converted_client_id) {
    patch.converted_client_id = dup.converted_client_id;
    patch.close_source = dup.close_source ?? canonical.close_source;
  }

  const altGhls = new Set(raw.alternate_ghl_contact_ids ?? []);
  if (dup.ghl_contact_id && dup.ghl_contact_id !== canonical.ghl_contact_id) {
    altGhls.add(dup.ghl_contact_id);
  }
  if (altGhls.size) raw.alternate_ghl_contact_ids = [...altGhls];

  const mergedFrom = new Set(raw.merged_from_lead_ids ?? []);
  mergedFrom.add(dup.id);
  raw.merged_from_lead_ids = [...mergedFrom];
  raw.merged_at = new Date().toISOString();
  if (dupRaw) raw.merged_raw = { ...(raw.merged_raw ?? {}), [dup.id]: dupRaw };

  if (Object.keys(patch).length || JSON.stringify(raw) !== JSON.stringify(canonical.raw ?? {})) {
    patch.raw = raw;
    report.canonical_updated++;
  }
  return patch;
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    groups: 0,
    leads_merged: 0,
    leads_deleted: 0,
    children_repointed: 0,
    canonical_updated: 0,
    errors: [],
    sample: [],
  };

  const leads = await fetchAll(
    '/rest/v1/acquisition_leads?select=id,lead_name,email,phone,ghl_contact_id,sheet_lead_key,source,created_at,inserted_at,converted_client_id,close_source,offer_interest,ad_name,ad_set,utm_source,utm_campaign,utm_content,qualified,raw',
  );
  const byId = new Map(leads.map((l) => [l.id, l]));
  const { counts: childCounts, byLead } = await buildChildMaps();

  const uf = new UnionFind();
  for (const lead of leads) uf.find(lead.id);

  /** Only merge on shared email, or shared phone when names are compatible. */
  function namesCompatible(a, b) {
    const stem = (name) =>
      String(name ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)[0];
    const sa = stem(a?.lead_name);
    const sb = stem(b?.lead_name);
    if (!sa || !sb) return false;
    return sa === sb || sa.includes(sb) || sb.includes(sa);
  }

  const emailToIds = new Map();
  const phoneToIds = new Map();
  for (const lead of leads) {
    const e = normalizeEmail(lead.email);
    if (e) {
      const list = emailToIds.get(e) ?? [];
      list.push(lead.id);
      emailToIds.set(e, list);
    }
    const p = phoneDigits10(lead.phone);
    if (p) {
      const list = phoneToIds.get(p) ?? [];
      list.push(lead.id);
      phoneToIds.set(p, list);
    }
  }

  for (const ids of emailToIds.values()) {
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
  }
  for (const ids of phoneToIds.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = byId.get(ids[i]);
        const b = byId.get(ids[j]);
        if (a && b && namesCompatible(a, b)) uf.union(ids[i], ids[j]);
      }
    }
  }

  const groups = new Map();
  for (const lead of leads) {
    const root = uf.find(lead.id);
    const list = groups.get(root) ?? [];
    list.push(lead.id);
    groups.set(root, list);
  }

  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    report.groups++;

    const members = ids.map((id) => byId.get(id)).filter(Boolean);
    const canonical = [...members].sort(
      (a, b) => scoreLead(b, childCounts) - scoreLead(a, childCounts),
    )[0];
    const duplicates = members.filter((m) => m.id !== canonical.id);

    if (report.sample.length < 8) {
      report.sample.push({
        canonical: { id: canonical.id, name: canonical.lead_name, email: canonical.email },
        merged: duplicates.map((d) => ({ id: d.id, name: d.lead_name, ghl: d.ghl_contact_id })),
      });
    }

    for (const dup of duplicates) {
      await repointChildren(dup.id, canonical.id, byLead, report);

      const canonicalPatch = mergeLeadFields(canonical, dup, report);

      // Clear unique keys on duplicate before canonical may receive dup's ghl id.
      if (dup.ghl_contact_id || dup.sheet_lead_key) {
        const clr = await patch('acquisition_leads', dup.id, {
          ghl_contact_id: null,
          sheet_lead_key: null,
        });
        if (clr.status >= 300) {
          report.errors.push(`clear keys ${dup.id}: ${clr.status}`);
          continue;
        }
      }

      if (Object.keys(canonicalPatch).length) {
        const res = await patch('acquisition_leads', canonical.id, canonicalPatch);
        if (res.status >= 300) {
          report.errors.push(`patch canonical ${canonical.id}: ${res.status} ${res.data}`);
        } else {
          Object.assign(canonical, canonicalPatch);
        }
      }

      const delRes = await del('acquisition_leads', dup.id);
      if (delRes.status >= 300) {
        report.errors.push(`delete ${dup.id}: ${delRes.status} ${delRes.data}`);
      } else {
        report.leads_deleted++;
        report.leads_merged++;
      }
    }
  }

  const outPath = resolve(
    ROOT,
    `data/import/acquisition/merge-duplicate-leads-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(DRY_RUN ? '[dry-run]' : '[applied]', JSON.stringify(report, null, 2));
  console.log(`Report: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Merge duplicate acquisition_leads (same phone/email) and link orphan dials.
 * Dial-only GHL contact creates often share a phone but have blank names — merge
 * on phone without requiring name match.
 *
 * Usage:
 *   node scripts/dedupe-acquisition-leads.mjs --dry-run
 *   node scripts/dedupe-acquisition-leads.mjs --apply
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
  if (lead.lead_name) s += 5;
  if (lead.email && lead.phone) s += 3;
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

async function repointChildren(fromId, toId, report) {
  report.children_repointed += 1;
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

async function linkOrphanDials(leads, report) {
  const byGhl = new Map();
  const byPhone = new Map();
  for (const lead of leads) {
    if (lead.ghl_contact_id) byGhl.set(lead.ghl_contact_id, lead.id);
    const alt = lead.raw?.alternate_ghl_contact_ids;
    if (Array.isArray(alt)) {
      for (const id of alt) {
        if (typeof id === 'string' && id.trim()) byGhl.set(id.trim(), lead.id);
      }
    }
    const p = phoneDigits10(lead.phone);
    if (p) byPhone.set(p, lead.id);
  }

  const orphanDials = await fetchAll(
    '/rest/v1/acquisition_dials?select=id,lead_id,ghl_contact_id,phone&lead_id=is.null',
  );

  for (const dial of orphanDials) {
    const targetLeadId =
      (dial.ghl_contact_id && byGhl.get(dial.ghl_contact_id)) ||
      (phoneDigits10(dial.phone) && byPhone.get(phoneDigits10(dial.phone))) ||
      null;
    if (!targetLeadId) continue;

    report.orphan_dials_linked++;
    if (!DRY_RUN) {
      const res = await patch('acquisition_dials', dial.id, { lead_id: targetLeadId });
      if (res.status >= 300) {
        report.errors.push(`dial ${dial.id}: ${res.status}`);
        continue;
      }
      await supabaseRequest('PATCH', `/rest/v1/acquisition_calls?dial_id=eq.${dial.id}`, {
        lead_id: targetLeadId,
      });
    }
  }
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
    orphan_dials_linked: 0,
    errors: [],
    sample: [],
  };

  const leads = await fetchAll(
    '/rest/v1/acquisition_leads?select=id,lead_name,email,phone,ghl_contact_id,sheet_lead_key,source,created_at,inserted_at,converted_client_id,close_source,offer_interest,ad_name,ad_set,utm_source,utm_campaign,utm_content,qualified,raw',
  );
  const byId = new Map(leads.map((l) => [l.id, l]));
  const { counts: childCounts } = await buildChildMaps();

  const uf = new UnionFind();
  for (const lead of leads) uf.find(lead.id);

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
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
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
        canonical: {
          id: canonical.id,
          name: canonical.lead_name,
          phone: canonical.phone,
          ghl: canonical.ghl_contact_id,
        },
        merged: duplicates.map((d) => ({
          id: d.id,
          name: d.lead_name,
          phone: d.phone,
          ghl: d.ghl_contact_id,
        })),
      });
    }

    for (const dup of duplicates) {
      await repointChildren(dup.id, canonical.id, report);

      const canonicalPatch = mergeLeadFields(canonical, dup, report);

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

  const refreshedLeads = DRY_RUN
    ? leads
    : await fetchAll(
        '/rest/v1/acquisition_leads?select=id,phone,ghl_contact_id,raw',
      );
  await linkOrphanDials(refreshedLeads, report);

  const outPath = resolve(
    ROOT,
    `data/import/acquisition/dedupe-leads-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(DRY_RUN ? '[dry-run]' : '[applied]', JSON.stringify(report, null, 2));
  console.log(`Report: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

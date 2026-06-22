#!/usr/bin/env node
/**
 * Backfill acquisition data model integrity:
 *   1. Index all GHL acquisition-location contacts (phone + email → contact id)
 *   2. Fill missing acquisition_leads.ghl_contact_id
 *   3. Link orphan appointments / offers / dials / calls to the canonical lead
 *
 * Data model: acquisition_leads is the source of truth (ghl_contact_id is the GHL key).
 * Child tables hold lead_id FKs; denormalized name/phone on appointments is display-only.
 *
 * Usage:
 *   node scripts/backfill-acquisition-ghl-linkage.mjs --dry-run
 *   node scripts/backfill-acquisition-ghl-linkage.mjs --apply
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseRequest, fetchAll } from './lib/supabase-rest.mjs';
import { createGhlClient, ghlContactName, ghlCustomField } from './lib/ghl-api.mjs';
import {
  buildGhlIndexes,
  buildLeadIndexes,
  extractGhlContactId,
  normalizeEmail,
  normalizePhoneE164,
  phoneDigits10,
  resolveGhlContact,
  resolveLead,
} from './lib/acquisition-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = !process.argv.includes('--apply');

function loadEnv() {
  const fromProcess = {
    GHL_ACQUISITION_API_TOKEN: process.env.GHL_ACQUISITION_API_TOKEN,
    GHL_API_TOKEN: process.env.GHL_API_TOKEN,
    GHL_ACQUISITION_LOCATION_ID: process.env.GHL_ACQUISITION_LOCATION_ID,
  };
  const envPath = resolve(ROOT, '.env.local');
  if (!existsSync(envPath)) return fromProcess;
  const fileEnv = readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .reduce((acc, line) => {
      const [k, ...v] = line.split('=');
      if (k && v.length) acc[k.trim()] = v.join('=').trim();
      return acc;
    }, {});
  return { ...fromProcess, ...fileEnv };
}

async function patch(table, id, body) {
  if (DRY_RUN) return { status: 200 };
  const payload = { ...body };
  if (table !== 'acquisition_dials') payload.updated_at = new Date().toISOString();
  return supabaseRequest('PATCH', `/rest/v1/${table}?id=eq.${id}`, payload);
}

async function insert(table, body) {
  if (DRY_RUN) return { status: 201, data: JSON.stringify([{ id: `dry-run-${Date.now()}` }]) };
  return supabaseRequest('POST', `/rest/v1/${table}`, body);
}

function normalizeLeadSource(raw) {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'meta' || s === 'facebook' || s === 'fb' || s === 'ig' || s.includes('meta')) return 'Meta';
  if (s === 'referral' || s.includes('refer')) return 'Referral';
  if (s === 'cold' || s.includes('cold')) return 'Cold';
  if (s === 'organic' || s === 'funnel' || s.includes('organic') || s.includes('website')) return 'organic';
  if (['organic', 'Meta', 'Referral', 'Cold', 'Unknown'].includes(raw.trim())) return raw.trim();
  if (raw.trim().toLowerCase() === 'unknown') return 'Unknown';
  return null;
}

function ghlLeadSource(contact) {
  const raw =
    ghlCustomField(contact, 'where did the lead come from', 'lead source') ?? contact.source;
  return normalizeLeadSource(raw);
}

function addLeadToIndex(leadIndex, lead) {
  leadIndex.byId.set(lead.id, lead);
  if (lead.ghl_contact_id) leadIndex.byGhl.set(lead.ghl_contact_id, lead);
  const p = phoneDigits10(lead.phone);
  if (p) {
    const list = leadIndex.byPhone.get(p) ?? [];
    list.push(lead);
    leadIndex.byPhone.set(p, list);
  }
  const e = normalizeEmail(lead.email);
  if (e) {
    const list = leadIndex.byEmail.get(e) ?? [];
    list.push(lead);
    leadIndex.byEmail.set(e, list);
  }
}

async function auditCounts() {
  const counts = {};
  for (const [table, col] of [
    ['acquisition_leads', 'ghl_contact_id'],
    ['acquisition_appointments', 'lead_id'],
    ['acquisition_offers', 'lead_id'],
    ['acquisition_closes', 'lead_id'],
  ]) {
    const all = await fetchAll(`/rest/v1/${table}?select=id,${col}`);
    counts[table] = {
      total: all.length,
      linked: all.filter((r) => r[col]).length,
      orphans: all.filter((r) => !r[col]).length,
    };
  }
  return counts;
}

async function main() {
  const env = loadEnv();
  const token = env.GHL_ACQUISITION_API_TOKEN || env.GHL_API_TOKEN;
  const locationId = env.GHL_ACQUISITION_LOCATION_ID || 'AcDN4LEPnbiqOCWzG1NH';

  if (!token) throw new Error('GHL_ACQUISITION_API_TOKEN or GHL_API_TOKEN required in .env.local');

  const report = {
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    audit_before: await auditCounts(),
    ghl_contacts_indexed: 0,
    leads_ghl_filled: 0,
    leads_ghl_skipped_conflict: 0,
    leads_created_from_ghl: 0,
    appointments_linked: 0,
    offers_linked: 0,
    dials_linked: 0,
    calls_linked: 0,
    warnings: [],
  };

  console.log('Fetching GHL contacts…');
  const ghl = createGhlClient(token, { delayMs: 80 });
  const ghlContacts = [];
  for await (const contact of ghl.searchContacts(locationId, { pageLimit: 100 })) {
    ghlContacts.push(contact);
  }
  report.ghl_contacts_indexed = ghlContacts.length;
  const ghlIndex = buildGhlIndexes(ghlContacts);
  console.log(`Indexed ${ghlContacts.length} GHL contacts`);

  console.log('Loading Supabase acquisition leads…');
  const leads = await fetchAll(
    '/rest/v1/acquisition_leads?select=id,ghl_contact_id,lead_name,email,phone,created_at,converted_client_id',
  );
  let leadIndex = buildLeadIndexes(leads);

  for (const lead of leads) {
    if (lead.ghl_contact_id) continue;
    const ghlContact = resolveGhlContact(ghlIndex, {
      phone: lead.phone,
      email: lead.email,
    });
    if (!ghlContact?.id) {
      report.warnings.push(`lead_no_ghl_match: ${lead.id} ${lead.lead_name ?? ''} ${lead.phone ?? ''}`);
      continue;
    }
    const existing = leadIndex.byGhl.get(ghlContact.id);
    if (existing && existing.id !== lead.id) {
      report.leads_ghl_skipped_conflict++;
      report.warnings.push(`ghl_id_conflict: lead ${lead.id} → ${ghlContact.id} already on ${existing.id}`);
      continue;
    }
    const res = await patch('acquisition_leads', lead.id, {
      ghl_contact_id: ghlContact.id,
      lead_name: lead.lead_name ?? ghlContactName(ghlContact),
      email: lead.email ?? normalizeEmail(ghlContact.email),
      phone: lead.phone ?? normalizePhoneE164(ghlContact.phone),
    });
    if (res.status < 300) {
      report.leads_ghl_filled++;
      lead.ghl_contact_id = ghlContact.id;
      leadIndex.byGhl.set(ghlContact.id, lead);
    }
  }

  leadIndex = buildLeadIndexes(leads);

  async function createLeadFromGhl(ghlContact, childRow) {
    if (!ghlContact?.id) return null;
    const existing = leadIndex.byGhl.get(ghlContact.id);
    if (existing) return existing;

    const sourceRaw =
      ghlCustomField(ghlContact, 'where did the lead come from', 'lead source') ??
      ghlContact.source;
    const source = ghlLeadSource(ghlContact);
    const row = {
      ghl_contact_id: ghlContact.id,
      lead_name: childRow.lead_name ?? ghlContactName(ghlContact),
      email: normalizeEmail(ghlContact.email),
      phone: normalizePhoneE164(childRow.phone) ?? normalizePhoneE164(ghlContact.phone),
      source,
      created_at: ghlContact.dateAdded ?? childRow.booked_at ?? new Date().toISOString(),
      raw: {
        ghl_backfill: true,
        lead_source_raw: sourceRaw ?? null,
        backfill_from: 'ghl_linkage_script',
        appointment_id: childRow.id ?? null,
      },
      updated_at: new Date().toISOString(),
    };

    const res = await insert('acquisition_leads', row);
    if (res.status >= 300) {
      report.warnings.push(
        `lead_create_failed: child ${childRow.id} ghl ${ghlContact.id} status ${res.status}`,
      );
      return null;
    }

    const created = JSON.parse(res.data)[0];
    const lead = { ...row, id: created.id };
    leads.push(lead);
    addLeadToIndex(leadIndex, lead);
    report.leads_created_from_ghl++;
    return lead;
  }

  async function linkChildren(table, select, getKeys, { createMissingLeads = false } = {}) {
    const rows = await fetchAll(`/rest/v1/${table}?select=${select}`);
    let linked = 0;
    for (const row of rows) {
      if (row.lead_id) continue;
      const keys = getKeys(row);
      let lead = resolveLead(leadIndex, keys);
      const ghlContact = resolveGhlContact(ghlIndex, keys);
      if (!lead && ghlContact?.id) {
        lead = leadIndex.byGhl.get(ghlContact.id) ?? null;
        if (!lead && createMissingLeads) {
          lead = await createLeadFromGhl(ghlContact, row);
        }
      }
      if (!lead) {
        if (createMissingLeads && !ghlContact) {
          report.warnings.push(
            `${table}_no_match: ${row.id} ${row.lead_name ?? ''} ${row.phone ?? ''}`,
          );
        }
        continue;
      }
      const res = await patch(table, row.id, { lead_id: lead.id });
      if (res.status < 300) {
        linked++;
        row.lead_id = lead.id;
      }
    }
    return linked;
  }

  report.appointments_linked = await linkChildren(
    'acquisition_appointments',
    'id,lead_id,lead_name,phone,booked_at,raw,ghl_appointment_id',
    (row) => ({
      phone: row.phone ?? row.raw?.sheet?.['Phone Number'] ?? row.raw?.phone,
      email: row.raw?.sheet?.Email ?? row.raw?.email,
      ghlContactId:
        row.raw?.ghl_contact_id ??
        row.raw?.contact_id ??
        extractGhlContactId(row.raw?.sheet?.['Link To Contact']),
    }),
    { createMissingLeads: true },
  );

  report.offers_linked = await linkChildren(
    'acquisition_offers',
    'id,lead_id,ghl_contact_link,raw',
    (row) => ({
      phone: row.raw?.sheet?.['Phone Number'] ?? row.raw?.phone,
      email: row.raw?.sheet?.Email ?? row.raw?.email,
      ghlContactId:
        extractGhlContactId(row.ghl_contact_link) ??
        row.raw?.ghl_contact_id ??
        row.raw?.sheet?.['Lead ID'],
    }),
  );

  report.dials_linked = await linkChildren(
    'acquisition_dials',
    'id,lead_id,phone,raw',
    (row) => ({
      phone: row.phone ?? row.raw?.phone,
      email: row.raw?.email,
    }),
  );

  report.calls_linked = await linkChildren(
    'acquisition_calls',
    'id,lead_id,raw',
    (row) => ({
      phone: row.raw?.phone,
      email: row.raw?.email,
      ghlContactId: row.raw?.ghl_contact_id ?? row.raw?.contact_id,
    }),
  );

  report.audit_after = await auditCounts();
  report.samples = {
    unlinked_appointments: (
      await fetchAll(
        '/rest/v1/acquisition_appointments?select=id,lead_name,phone&lead_id=is.null&limit=5',
      )
    ).slice(0, 5),
    unlinked_leads_no_ghl: (
      await fetchAll(
        '/rest/v1/acquisition_leads?select=id,lead_name,phone,email&ghl_contact_id=is.null&limit=5',
      )
    ).slice(0, 5),
  };

  const outPath = resolve(
    ROOT,
    `data/import/acquisition/ghl-linkage-backfill-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(DRY_RUN ? '[dry-run]' : '[applied]', JSON.stringify(report, null, 2));
  console.log('Report:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

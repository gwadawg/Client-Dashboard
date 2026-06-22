#!/usr/bin/env node
/**
 * Pull GHL contact data for backfill-created leads and align created_at with GHL dateAdded.
 *
 * Targets leads from company close backfill, recent inserts, or missing GHL linkage.
 *
 * Usage:
 *   node scripts/sync-acquisition-leads-from-ghl.mjs --dry-run
 *   node scripts/sync-acquisition-leads-from-ghl.mjs --apply
 *   node scripts/sync-acquisition-leads-from-ghl.mjs --apply --since 2026-06-18
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseRequest, fetchAll } from './lib/supabase-rest.mjs';
import { createGhlClient, ghlContactName, ghlCustomField } from './lib/ghl-api.mjs';
import {
  buildGhlIndexes,
  normalizeEmail,
  normalizePhoneE164,
  phoneDigits10,
  pickBestGhlContact,
  resolveGhlContact,
} from './lib/acquisition-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = !process.argv.includes('--apply');
const sinceIdx = process.argv.indexOf('--since');
const SINCE = sinceIdx >= 0 ? process.argv[sinceIdx + 1] : '2026-06-18';

function loadEnv() {
  const fromProcess = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GHL_ACQUISITION_API_TOKEN: process.env.GHL_ACQUISITION_API_TOKEN,
    GHL_API_TOKEN: process.env.GHL_API_TOKEN,
    GHL_ACQUISITION_LOCATION_ID: process.env.GHL_ACQUISITION_LOCATION_ID,
  };
  for (const envPath of [
    resolve(ROOT, '.env.local'),
    resolve(dirname(ROOT), 'Repos/call-center-reporting-template - Copy/.env.local'),
  ]) {
    if (!existsSync(envPath)) continue;
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
  return fromProcess;
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

function attributionFromGhl(contact) {
  const utm_content =
    ghlCustomField(contact, 'utm_content', 'utm content') ??
    ghlCustomField(contact, 'ad_name', 'ad name');
  const utm_medium =
    ghlCustomField(contact, 'utm_medium', 'utm medium', 'adset') ??
    ghlCustomField(contact, 'ad_set', 'ad set');
  const ad_name = utm_content ?? ghlCustomField(contact, 'ad_name', 'ad name');
  return {
    ad_name: ad_name?.trim() || null,
    ad_set: utm_medium?.trim() || null,
    utm_source: ghlCustomField(contact, 'utm_source', 'utm source')?.trim() || null,
    utm_campaign: ghlCustomField(contact, 'utm_campaign', 'utm campaign')?.trim() || null,
    utm_content: utm_content?.trim() || null,
  };
}

function ghlCreatedAt(contact) {
  const raw = contact.dateAdded ?? contact.createdAt ?? contact.dateCreated;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function isTargetLead(lead) {
  if (lead.raw?.company_report || lead.raw?.company_row_key) return true;
  if (lead.inserted_at >= `${SINCE}T00:00:00`) return true;
  if (lead.raw?.ghl_backfill || lead.raw?.reconcile_lead_linkage) return true;
  return false;
}

function sourceLocked(lead) {
  return !!(lead.raw?.lead_source_manual || lead.raw?.lead_source_updated_at);
}

async function patch(id, body) {
  if (DRY_RUN) return { status: 200 };
  return supabaseRequest('PATCH', `/rest/v1/acquisition_leads?id=eq.${id}`, {
    ...body,
    updated_at: new Date().toISOString(),
  });
}

async function findGhlContact(ghl, ghlIndex, lead, client) {
  const email = normalizeEmail(lead.email) ?? normalizeEmail(client?.email);
  const phone = lead.phone ?? client?.phone;
  const name = lead.lead_name ?? client?.name;

  if (lead.ghl_contact_id && ghlIndex.byId.has(lead.ghl_contact_id)) {
    return ghlIndex.byId.get(lead.ghl_contact_id);
  }
  if (client?.ghl_contact_id && ghlIndex.byId.has(client.ghl_contact_id)) {
    return ghlIndex.byId.get(client.ghl_contact_id);
  }

  const resolved = resolveGhlContact(ghlIndex, {
    ghlContactId: lead.ghl_contact_id ?? client?.ghl_contact_id,
    phone,
    email,
  });
  if (resolved) return resolved;

  const locationId = process.env.GHL_ACQUISITION_LOCATION_ID || 'AcDN4LEPnbiqOCWzG1NH';
  const needle = phoneDigits10(phone);
  if (needle) {
    for await (const c of ghl.searchContacts(locationId, { pageLimit: 25, query: needle })) {
      if (phoneDigits10(c.phone) === needle) return c;
    }
  }
  if (email) {
    for await (const c of ghl.searchContacts(locationId, { pageLimit: 25, query: email })) {
      if (normalizeEmail(c.email) === email) return c;
    }
  }
  if (name) {
    const candidates = [];
    for await (const c of ghl.searchContacts(locationId, { pageLimit: 25, query: name })) {
      const cName = ghlContactName(c)?.toLowerCase() ?? '';
      const target = name.toLowerCase();
      if (cName === target || cName.includes(target) || target.includes(cName)) candidates.push(c);
    }
    return pickBestGhlContact(candidates);
  }
  return null;
}

async function main() {
  const env = loadEnv();
  const token = env.GHL_ACQUISITION_API_TOKEN || env.GHL_API_TOKEN;
  const locationId = env.GHL_ACQUISITION_LOCATION_ID || 'AcDN4LEPnbiqOCWzG1NH';
  if (!token) throw new Error('GHL_ACQUISITION_API_TOKEN or GHL_API_TOKEN required');

  process.env.GHL_ACQUISITION_LOCATION_ID = locationId;

  const report = {
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    since: SINCE,
    targets: 0,
    ghl_matched: 0,
    ghl_not_found: 0,
    updated: 0,
    created_at_aligned: 0,
    rows: [],
    errors: [],
  };

  console.log('Indexing GHL contacts…');
  const ghl = createGhlClient(token, { delayMs: 80 });
  const contacts = [];
  for await (const c of ghl.searchContacts(locationId, { pageLimit: 100 })) contacts.push(c);
  const ghlIndex = buildGhlIndexes(contacts);
  console.log(`Indexed ${contacts.length} GHL contacts`);

  const leads = await fetchAll(
    '/rest/v1/acquisition_leads?select=id,lead_name,email,phone,ghl_contact_id,source,created_at,inserted_at,ad_name,ad_set,utm_source,utm_campaign,utm_content,converted_client_id,raw',
  );
  const clients = await fetchAll('/rest/v1/clients?select=id,name,email,phone,ghl_contact_id');
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const retryOnly = process.argv.includes('--retry-not-found');
  const targets = leads.filter((l) =>
    retryOnly
      ? (l.raw?.company_report || l.raw?.company_row_key) && !l.ghl_contact_id
      : isTargetLead(l) && (!l.raw?.ghl_sync_at || retryOnly),
  );
  report.targets = targets.length;
  console.log(`Syncing ${targets.length} target leads…`);

  for (const lead of targets) {
    const rowReport = {
      id: lead.id,
      name: lead.lead_name,
      email: lead.email,
      before_created_at: lead.created_at,
    };

    let contact = await findGhlContact(ghl, ghlIndex, lead, clientById.get(lead.converted_client_id));
    if (!contact && lead.email) {
      const emailMatches = ghlIndex.byEmail.get(normalizeEmail(lead.email)) ?? [];
      contact = pickBestGhlContact(emailMatches);
    }
    if (!contact && lead.phone) {
      const phoneMatches = ghlIndex.byPhone.get(phoneDigits10(lead.phone)) ?? [];
      contact = pickBestGhlContact(phoneMatches);
    }

    if (!contact?.id) {
      report.ghl_not_found++;
      rowReport.status = 'ghl_not_found';
      report.rows.push(rowReport);
      continue;
    }

    report.ghl_matched++;
    const ghlCreated = ghlCreatedAt(contact);
    const attr = attributionFromGhl(contact);
    const source = ghlLeadSource(contact);

    const raw =
      lead.raw && typeof lead.raw === 'object' && !Array.isArray(lead.raw)
        ? { ...lead.raw }
        : {};
    raw.ghl_sync_at = new Date().toISOString();
    raw.ghl_date_added = ghlCreated;
    raw.ghl_contact_id_synced = contact.id;

    const client = clientById.get(lead.converted_client_id);
    const patchBody = {
      ghl_contact_id: contact.id,
      lead_name: lead.lead_name ?? ghlContactName(contact) ?? client?.name,
      email: lead.email ?? normalizeEmail(contact.email) ?? normalizeEmail(client?.email),
      phone: lead.phone ?? normalizePhoneE164(contact.phone) ?? normalizePhoneE164(client?.phone),
      raw,
    };

    if (ghlCreated) {
      patchBody.created_at = ghlCreated;
      rowReport.after_created_at = ghlCreated;
      if (lead.created_at !== ghlCreated) report.created_at_aligned++;
    }

    if (!sourceLocked(lead) && source) patchBody.source = source;
    if (!lead.ad_name && attr.ad_name) patchBody.ad_name = attr.ad_name;
    if (!lead.ad_set && attr.ad_set) patchBody.ad_set = attr.ad_set;
    if (!lead.utm_source && attr.utm_source) patchBody.utm_source = attr.utm_source;
    if (!lead.utm_campaign && attr.utm_campaign) patchBody.utm_campaign = attr.utm_campaign;
    if (!lead.utm_content && attr.utm_content) patchBody.utm_content = attr.utm_content;

    const res = await patch(lead.id, patchBody);
    if (res.status >= 300) {
      report.errors.push(`${lead.id}: ${res.status} ${res.data}`);
      rowReport.status = 'error';
    } else {
      report.updated++;
      rowReport.status = 'updated';
      rowReport.ghl_contact_id = contact.id;
    }
    report.rows.push(rowReport);
  }

  const outPath = resolve(
    ROOT,
    `data/import/acquisition/ghl-lead-sync-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(DRY_RUN ? '[dry-run]' : '[applied]', JSON.stringify(report, null, 2));
  console.log(`Report: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

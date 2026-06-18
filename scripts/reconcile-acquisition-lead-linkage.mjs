#!/usr/bin/env node
/**
 * Link orphan offers/closes to acquisition leads and fix offer↔close↔lead consistency.
 *
 * Usage:
 *   node scripts/reconcile-acquisition-lead-linkage.mjs --dry-run
 *   node scripts/reconcile-acquisition-lead-linkage.mjs --apply
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseRequest, fetchAll } from './lib/supabase-rest.mjs';
import {
  buildLeadIndexes,
  extractGhlContactId,
  normalizeEmail,
  normalizePhoneE164,
  phoneDigits10,
  pickBestLead,
  resolveLead,
} from './lib/acquisition-match.mjs';
import { clientsLikelySameClient, clientNameStem } from './lib/roster-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = !process.argv.includes('--apply');

const NAME_ALIASES = new Map([
  ['ryle', 'Ryles Murray'],
  ['peter escaross', 'Peter Escaross'],
]);

async function patch(table, id, body) {
  if (DRY_RUN) return { status: 200 };
  return supabaseRequest('PATCH', `/rest/v1/${table}?id=eq.${id}`, {
    ...body,
    updated_at: new Date().toISOString(),
  });
}

function sheetPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.sheet && typeof raw.sheet === 'object') return raw.sheet;
  return null;
}

function matchLeadByName(name, allLeads) {
  if (!name?.trim()) return null;
  const trimmed = name.trim();
  const alias = NAME_ALIASES.get(trimmed.toLowerCase()) ?? NAME_ALIASES.get(clientNameStem(trimmed));
  const target = alias ?? trimmed;
  const matches = allLeads.filter((l) => clientsLikelySameClient(l.lead_name ?? '', target));
  return pickBestLead(matches);
}

function resolveLeadForOffer(offer, leadIdx, allLeads) {
  const sheet = sheetPayload(offer.raw);
  const keys = {
    ghl_contact_id:
      sheet?.['Lead ID']?.trim() ||
      extractGhlContactId(sheet?.['Link To Contact']) ||
      null,
    phone: sheet?.['Phone Number'] ?? null,
    email: null,
  };
  const byKeys = resolveLead(leadIdx, keys);
  if (byKeys) return byKeys;
  const name = sheet?.Name?.trim();
  return matchLeadByName(name, allLeads);
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    offers_linked: 0,
    closes_lead_synced: 0,
    closes_offer_linked: 0,
    gaps: [],
  };

  const [allLeads, offers, closes] = await Promise.all([
    fetchAll(
      '/rest/v1/acquisition_leads?select=id,lead_name,email,phone,ghl_contact_id,created_at,converted_client_id',
    ),
    fetchAll('/rest/v1/acquisition_offers?select=id,lead_id,offer_type,offered_at,is_closed,raw'),
    fetchAll(
      '/rest/v1/acquisition_closes?select=id,lead_id,offer_id,mapping_status,closed_at,offer_type',
    ),
  ]);

  const leadIdx = buildLeadIndexes(allLeads);
  const offerById = new Map(offers.map((o) => [o.id, o]));

  // ── 1. Link orphan offers ───────────────────────────────────────────────────
  for (const offer of offers) {
    if (offer.lead_id) continue;
    const lead = resolveLeadForOffer(offer, leadIdx, allLeads);
    if (!lead) {
      report.gaps.push({
        type: 'offer_no_lead',
        offer_id: offer.id,
        name: sheetPayload(offer.raw)?.Name ?? null,
      });
      continue;
    }
    await patch('acquisition_offers', offer.id, { lead_id: lead.id });
    offer.lead_id = lead.id;
    report.offers_linked++;
  }

  // ── 2. Sync close.lead_id to offer.lead_id ────────────────────────────────
  for (const close of closes) {
    if (!close.offer_id) continue;
    const offer = offerById.get(close.offer_id);
    if (!offer?.lead_id) continue;
    if (close.lead_id === offer.lead_id) continue;
    await patch('acquisition_closes', close.id, { lead_id: offer.lead_id });
    close.lead_id = offer.lead_id;
    report.closes_lead_synced++;
  }

  // ── 3. Link closes missing offer_id when one exists for same lead+date+type ─
  for (const close of closes) {
    if (close.offer_id || !close.lead_id) continue;
    const day = (close.closed_at ?? '').slice(0, 10);
    const match = offers.find(
      (o) =>
        o.lead_id === close.lead_id &&
        o.offer_type === (close.offer_type ?? 'Core Offer') &&
        (o.offered_at ?? '').slice(0, 10) === day,
    );
    if (!match) continue;
    await patch('acquisition_closes', close.id, { offer_id: match.id });
    close.offer_id = match.id;
    report.closes_offer_linked++;
  }

  const outPath = resolve(
    ROOT,
    `data/import/acquisition/reconcile-lead-linkage-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(DRY_RUN ? '[dry-run]' : '[applied]', JSON.stringify(report, null, 2));
  console.log('Report:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

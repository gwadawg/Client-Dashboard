#!/usr/bin/env node
/**
 * Reconcile acquisition offers/closes with the client roster — idempotent.
 *
 * Run AFTER sheet backfills (backfill-acquisition.mjs, closer-calls, ghl-linkage).
 *
 * What it does:
 *   1. Match signed clients → acquisition_leads (ghl_contact_id → email → phone)
 *   2. Set converted_client_id on leads
 *   3. Upsert mapped acquisition_closes (one per client_id)
 *   4. Map pending_client closes when the lead now has a roster client
 *   5. Create closes for offers marked is_closed when lead is linked to a client
 *   6. Report gaps (signed clients with no lead, closed offers with no client, duplicate closes)
 *
 * Usage:
 *   node scripts/reconcile-acquisition-closes.mjs --dry-run
 *   node scripts/reconcile-acquisition-closes.mjs --apply
 */

import { writeFileSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseRequest, fetchAll } from './lib/supabase-rest.mjs';
import {
  buildLeadIndexes,
  normalizeEmail,
  normalizePhoneE164,
  phoneDigits10,
  pickBestLead,
} from './lib/acquisition-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = pathResolve(__dirname, '..');
const DRY_RUN = !process.argv.includes('--apply');

async function patch(table, id, body) {
  if (DRY_RUN) return { status: 200 };
  return supabaseRequest('PATCH', `/rest/v1/${table}?id=eq.${id}`, {
    ...body,
    updated_at: new Date().toISOString(),
  });
}

async function insert(table, body) {
  if (DRY_RUN) return { status: 201, data: JSON.stringify([{ id: `dry-${Date.now()}` }]) };
  return supabaseRequest('POST', `/rest/v1/${table}`, body);
}

function resolveLeadForClient(client, leadIdx) {
  const ghl = client.ghl_contact_id?.trim();
  if (ghl && leadIdx.byGhl.has(ghl)) return leadIdx.byGhl.get(ghl);

  const email = normalizeEmail(client.email);
  if (email) {
    const hit = pickBestLead(leadIdx.byEmail.get(email) ?? []);
    if (hit) return hit;
  }

  const phone = phoneDigits10(client.phone);
  if (phone) {
    const hit = pickBestLead(leadIdx.byPhone.get(phone) ?? []);
    if (hit) return hit;
  }

  return null;
}

function closedAtFromClient(client) {
  if (client.date_signed) return `${client.date_signed}T12:00:00.000Z`;
  return null;
}

async function upsertMappedClose({
  leadId,
  clientId,
  closedAt,
  offerId,
  callId,
  offerType,
  cashCollected,
  setterName,
  closeSource,
  existingByClientId,
  existingPendingByLeadId,
}) {
  const row = {
    lead_id: leadId,
    client_id: clientId,
    closed_at: closedAt,
    close_source: closeSource,
    mapping_status: 'mapped',
    offer_type: offerType ?? 'Core Offer',
    offer_id: offerId ?? null,
    call_id: callId ?? null,
    cash_collected: cashCollected ?? null,
    setter_name: setterName ?? null,
  };

  const pending = existingPendingByLeadId.get(leadId);
  if (pending) {
    if (!DRY_RUN) {
      const { status, data } = await patch('acquisition_closes', pending.id, row);
      if (status !== 200) throw new Error(`pending close patch: ${data}`);
    }
    existingPendingByLeadId.delete(leadId);
    existingByClientId.set(clientId, { ...pending, ...row });
    return { action: 'merged_pending', closeId: pending.id };
  }

  const existing = existingByClientId.get(clientId);
  if (existing) {
    if (!DRY_RUN) {
      const { status, data } = await patch('acquisition_closes', existing.id, row);
      if (status !== 200) throw new Error(`close patch: ${data}`);
    }
    return { action: 'updated', closeId: existing.id };
  }

  if (!DRY_RUN) {
    const { status, data } = await insert('acquisition_closes', row);
    if (status !== 200 && status !== 201) throw new Error(`close insert: ${data}`);
    const parsed = JSON.parse(data);
    const id = Array.isArray(parsed) ? parsed[0]?.id : parsed?.id;
    existingByClientId.set(clientId, { id, ...row });
    return { action: 'created', closeId: id };
  }

  return { action: 'would_create', closeId: null };
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    clients_scanned: 0,
    leads_linked: 0,
    closes_created: 0,
    closes_updated: 0,
    closes_merged_pending: 0,
    offer_closes_created: 0,
    pending_mapped: 0,
    gaps: [],
    warnings: [],
  };

  const [clients, leads, offers, closes] = await Promise.all([
    fetchAll(
      '/rest/v1/clients?select=id,name,email,phone,date_signed,ghl_contact_id,reporting_type,service_program&date_signed=not.is.null',
    ),
    fetchAll(
      '/rest/v1/acquisition_leads?select=id,ghl_contact_id,email,phone,created_at,converted_client_id',
    ),
    fetchAll(
      '/rest/v1/acquisition_offers?select=id,lead_id,offered_at,offer_type,is_closed,cash_collected,setter_name,offered_by',
    ),
    fetchAll(
      '/rest/v1/acquisition_closes?select=id,lead_id,client_id,offer_id,call_id,closed_at,mapping_status,offer_type,cash_collected,setter_name,close_source',
    ),
  ]);

  const leadIdx = buildLeadIndexes(leads);
  const existingByClientId = new Map();
  const existingPendingByLeadId = new Map();
  const closesByOfferId = new Map();

  for (const c of closes) {
    if (c.client_id) existingByClientId.set(c.client_id, c);
    if (c.mapping_status === 'pending_client' && c.lead_id && !c.client_id) {
      existingPendingByLeadId.set(c.lead_id, c);
    }
    if (c.offer_id) closesByOfferId.set(c.offer_id, c);
  }

  // ── 1. Roster clients → leads + mapped closes ─────────────────────────────
  for (const client of clients) {
    report.clients_scanned++;
    const closedAt = closedAtFromClient(client);
    if (!closedAt) continue;

    const lead = resolveLeadForClient(client, leadIdx);
    if (!lead) {
      report.gaps.push({
        type: 'signed_client_no_lead',
        client_id: client.id,
        name: client.name,
        date_signed: client.date_signed,
        email: client.email,
        phone: client.phone,
      });
      continue;
    }

    if (lead.converted_client_id !== client.id) {
      if (!DRY_RUN) {
        const { status, data } = await patch('acquisition_leads', lead.id, {
          converted_client_id: client.id,
          close_source: 'roster',
        });
        if (status !== 200) report.warnings.push(`lead link ${lead.id}: ${data}`);
      }
      lead.converted_client_id = client.id;
      report.leads_linked++;
    }

    const result = await upsertMappedClose({
      leadId: lead.id,
      clientId: client.id,
      closedAt,
      offerType: client.reporting_type ?? 'Core Offer',
      closeSource: 'roster',
      existingByClientId,
      existingPendingByLeadId,
    });

    if (result.action === 'created' || result.action === 'would_create') report.closes_created++;
    else if (result.action === 'updated') report.closes_updated++;
    else if (result.action === 'merged_pending') report.closes_merged_pending++;
  }

  // ── 2. Remaining pending closes where lead already has converted_client_id ─
  for (const [leadId, pending] of [...existingPendingByLeadId.entries()]) {
    const lead = leadIdx.byId.get(leadId);
    const clientId = lead?.converted_client_id;
    if (!clientId) continue;

    const client = clients.find((c) => c.id === clientId);
    const closedAt = pending.closed_at ?? closedAtFromClient(client) ?? new Date().toISOString();

    if (!DRY_RUN) {
      const { status, data } = await patch('acquisition_closes', pending.id, {
        client_id: clientId,
        mapping_status: 'mapped',
        closed_at: closedAt,
        close_source: pending.close_source === 'manual' ? 'manual' : 'roster',
      });
      if (status !== 200) report.warnings.push(`pending map ${pending.id}: ${data}`);
    }
    existingPendingByLeadId.delete(leadId);
    report.pending_mapped++;
  }

  // ── 3. Closed offers → acquisition_closes when client is known ────────────
  for (const offer of offers) {
    if (!offer.is_closed || !offer.lead_id) continue;
    if (closesByOfferId.has(offer.id)) continue;

    const lead = leadIdx.byId.get(offer.lead_id);
    const clientId = lead?.converted_client_id;
    if (!clientId) {
      report.gaps.push({
        type: 'closed_offer_no_client',
        offer_id: offer.id,
        lead_id: offer.lead_id,
        offered_at: offer.offered_at,
        offer_type: offer.offer_type,
      });
      continue;
    }

    const closedAt = offer.offered_at ?? new Date().toISOString();
    const result = await upsertMappedClose({
      leadId: offer.lead_id,
      clientId,
      closedAt,
      offerId: offer.id,
      offerType: offer.offer_type,
      cashCollected: offer.cash_collected,
      setterName: offer.setter_name,
      closeSource: 'offer_sheet',
      existingByClientId,
      existingPendingByLeadId,
    });

    closesByOfferId.set(offer.id, { id: result.closeId, offer_id: offer.id });
    report.offer_closes_created++;
  }

  // ── 4. Audit: duplicate closes per lead ───────────────────────────────────
  const byLead = new Map();
  for (const c of closes) {
    if (!c.lead_id || c.mapping_status === 'dismissed') continue;
    const list = byLead.get(c.lead_id) ?? [];
    list.push(c);
    byLead.set(c.lead_id, list);
  }
  for (const [leadId, list] of byLead) {
    if (list.length <= 1) continue;
    const mapped = list.filter((c) => c.mapping_status === 'mapped' && c.client_id);
    report.warnings.push({
      type: 'duplicate_closes_per_lead',
      lead_id: leadId,
      count: list.length,
      close_ids: list.map((c) => c.id),
      hint: mapped.length
        ? 'Keep mapped row with client_id; dismiss extras in Pending Closes or SQL'
        : 'Merge or dismiss pending duplicates',
    });
  }

  const outPath = pathResolve(
    ROOT,
    `data/import/acquisition/reconcile-closes-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(DRY_RUN ? '[dry-run]' : '[applied]', JSON.stringify(report, null, 2));
  console.log('Report:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

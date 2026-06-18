#!/usr/bin/env node
/**
 * Backfill acquisition leads, offers, and closes from WM Company Report - Clients.csv.
 *
 * Each row = one signed client close. Ensures every close has a linked offer row.
 * Matches leads/clients by email → phone → name (fuzzy). Unmapped roster matches
 * stay as pending_client closes for manual linking in the dashboard.
 *
 * Usage:
 *   node scripts/backfill-acquisition-company-closes.mjs --dry-run
 *   node scripts/backfill-acquisition-company-closes.mjs --apply
 *   node scripts/backfill-acquisition-company-closes.mjs --dry-run --csv /path/to/file.csv
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import {
  clientsLikelySameClient,
  clientNameStem,
  normalizeEmail,
  normalizePhone,
} from './lib/roster-match.mjs';
import {
  buildLeadIndexes,
  phoneDigits10,
  pickBestLead,
} from './lib/acquisition-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_CSV = resolve(ROOT, 'data/import/acquisition/WM _ Company Report - Clients.csv');

/** CSV lead name → roster client name (when email/phone/fuzzy name miss). */
const COMPANY_CLIENT_ALIASES = new Map([
  ['Anthony Usher', 'Tony Usher'],
  ['RJ', 'RJ Hartnett'],
  ['Ken Walker', 'Kenneth Walker'],
  ['Toby English', 'Community First National Bank'],
  ["Patrick O Connel", 'OC Home Loans'],
  ["Patrick  O'connell", 'OC Home Loans'],
  ['Amir S', 'Amir Abuhalimeh'],
  ['Brian Thomas', "Brian Thomas's Office"],
]);

const DRY_RUN = !process.argv.includes('--apply');
const csvArgIdx = process.argv.indexOf('--csv');
const CSV_PATH = csvArgIdx >= 0 ? resolve(process.argv[csvArgIdx + 1]) : DEFAULT_CSV;

let supabaseRequest;
let fetchAll;

async function loadSupabase() {
  if (!supabaseRequest) {
    ({ supabaseRequest, fetchAll } = await import('./lib/supabase-rest.mjs'));
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      if (c === '\r') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}

function parseSheetDate(raw) {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 12)).toISOString();
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return new Date(Date.UTC(+m2[3], +m2[1] - 1, +m2[2], 12)).toISOString();
  return null;
}

function parseCurrency(raw) {
  if (!raw?.trim()) return null;
  const n = Number(String(raw).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeSource(raw) {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'meta' || s.includes('facebook')) return 'Meta';
  if (s.includes('refer') || s === 'linkedin') return 'Referral';
  if (s.includes('cold')) return 'Cold';
  if (s === 'organic' || s.includes('organic')) return 'organic';
  return raw.trim();
}

function normalizeReportingType(raw) {
  const s = (raw ?? '').trim().toUpperCase();
  if (s === 'HE' || s === 'RM' || s === 'CALL_CENTER') return s;
  return 'RM';
}

function companyRowKey(clientNum, dateStarted, name) {
  return createHash('sha256')
    .update(`company|${clientNum}|${dateStarted}|${name}`)
    .digest('hex')
    .slice(0, 24);
}

function matchLeadByName(name, leads) {
  if (!name?.trim()) return null;
  const matches = leads.filter((l) => clientsLikelySameClient(l.lead_name ?? '', name));
  return pickBestLead(matches);
}

function matchClient(row, clients) {
  const aliasTarget = COMPANY_CLIENT_ALIASES.get(row.name?.trim() ?? '');
  if (aliasTarget) {
    const aliasHit = clients.find((c) => clientsLikelySameClient(c.name, aliasTarget));
    if (aliasHit) return aliasHit;
  }

  const email = normalizeEmail(row.email);
  if (email) {
    const hit = clients.find((c) => normalizeEmail(c.email) === email);
    if (hit) return hit;
  }
  const phone = normalizePhone(row.phone);
  const digits = phoneDigits10(phone);
  if (digits) {
    const hits = clients.filter((c) => phoneDigits10(c.phone) === digits);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      const byName = hits.find((c) =>
        clientsLikelySameClient(c.name, row.name) ||
        clientsLikelySameClient(c.primary_contact_name ?? '', row.name),
      );
      if (byName) return byName;
      return hits[0];
    }
  }
  const byName = clients.filter(
    (c) =>
      clientsLikelySameClient(c.name, row.name) ||
      clientsLikelySameClient(c.primary_contact_name ?? '', row.name) ||
      clientNameStem(c.name) === clientNameStem(row.name),
  );
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    return byName.find((c) => c.date_signed === row.date_started.slice(0, 10)) ?? byName[0];
  }
  return null;
}

function resolveLead(row, leadIdx, allLeads) {
  const email = normalizeEmail(row.email);
  if (email) {
    const hit = pickBestLead(leadIdx.byEmail.get(email) ?? []);
    if (hit) return hit;
  }
  const digits = phoneDigits10(row.phone);
  if (digits) {
    const hit = pickBestLead(leadIdx.byPhone.get(digits) ?? []);
    if (hit) return hit;
  }
  return matchLeadByName(row.name, allLeads);
}

async function patch(table, id, body) {
  if (DRY_RUN) return { status: 200, data: '[]' };
  return supabaseRequest('PATCH', `/rest/v1/${table}?id=eq.${id}`, body);
}

async function insert(table, body) {
  if (DRY_RUN) return { status: 201, data: JSON.stringify([{ id: `dry-${Date.now()}` }]) };
  return supabaseRequest('POST', `/rest/v1/${table}`, body);
}

async function main() {
  if (!existsSync(CSV_PATH)) throw new Error(`Missing CSV: ${CSV_PATH}`);
  await loadSupabase();

  const table = parseCsv(readFileSync(CSV_PATH, 'utf-8'));
  const hdr = table[0];
  const col = (name) => hdr.indexOf(name);

  const [allLeads, allClients, allOffers, allCloses] = await Promise.all([
    fetchAll('/rest/v1/acquisition_leads?select=id,lead_name,email,phone,ghl_contact_id,source,converted_client_id,created_at'),
    fetchAll('/rest/v1/clients?select=id,name,email,phone,date_signed,ghl_contact_id,primary_contact_name,reporting_type'),
    fetchAll('/rest/v1/acquisition_offers?select=id,lead_id,offered_at,offer_type,is_closed,cash_collected,raw'),
    fetchAll('/rest/v1/acquisition_closes?select=id,lead_id,client_id,offer_id,mapping_status,closed_at,raw'),
  ]);

  const leadIdx = buildLeadIndexes(allLeads);
  const offerByKey = new Map();
  for (const o of allOffers) {
    const key = o.raw?.company_row_key ?? `${o.lead_id}|${(o.offered_at ?? '').slice(0, 10)}|${o.offer_type}`;
    offerByKey.set(key, o);
  }
  const closeByCompanyKey = new Map();
  const closeByClientId = new Map();
  for (const c of allCloses) {
    if (c.raw?.company_row_key) closeByCompanyKey.set(c.raw.company_row_key, c);
    if (c.client_id) closeByClientId.set(c.client_id, c);
  }

  const report = {
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    csv: CSV_PATH,
    rows_total: 0,
    leads_created: 0,
    leads_updated: 0,
    offers_created: 0,
    offers_skipped: 0,
    closes_created: 0,
    closes_updated: 0,
    closes_skipped: 0,
    mapped: 0,
    pending: 0,
    no_lead: 0,
    rows: [],
  };

  for (const cells of table.slice(1)) {
    const dateRaw = cells[col('Date Started')]?.trim();
    const name = cells[col('Client Name')]?.trim();
    if (!dateRaw || !name) continue;

    const dateStarted = parseSheetDate(dateRaw);
    if (!dateStarted) {
      report.rows.push({ name, status: 'skipped_invalid_date', date_raw: dateRaw });
      continue;
    }

    report.rows_total++;
    const row = {
      name,
      phone: cells[col('Phone Number')]?.trim() || null,
      email: cells[col('Email')]?.trim() || null,
      source: normalizeSource(cells[col('Source')]?.trim()),
      client_num: cells[col('Client#')]?.trim() || null,
      total_spent: parseCurrency(cells[col('Total Spent ')] ?? cells[col('Total Spent')]),
      reporting_type: normalizeReportingType(cells[col('Offer')]?.trim()),
      date_started: dateStarted,
    };
    const companyKey = companyRowKey(row.client_num, dateRaw, name);
    const rowReport = { name, client_num: row.client_num, date_started: dateStarted.slice(0, 10) };

    let lead = resolveLead(row, leadIdx, allLeads);
    if (!lead) {
      const sheetKey = `company:${companyKey}`;
      const leadRow = {
        sheet_lead_key: sheetKey,
        lead_name: name,
        email: normalizeEmail(row.email),
        phone: normalizePhone(row.phone),
        source: row.source,
        created_at: dateStarted,
        raw: { company_report: true, company_row_key: companyKey, client_num: row.client_num },
        updated_at: new Date().toISOString(),
      };
      const ins = await insert('acquisition_leads', leadRow);
      if (ins.status !== 200 && ins.status !== 201) {
        rowReport.status = 'error';
        rowReport.error = `lead insert: ${ins.data}`;
        report.rows.push(rowReport);
        continue;
      }
      const parsed = JSON.parse(ins.data);
      lead = Array.isArray(parsed) ? parsed[0] : parsed;
      allLeads.push(lead);
      if (lead.email) {
        const e = normalizeEmail(lead.email);
        const list = leadIdx.byEmail.get(e) ?? [];
        list.push(lead);
        leadIdx.byEmail.set(e, list);
      }
      const d = phoneDigits10(lead.phone);
      if (d) {
        const list = leadIdx.byPhone.get(d) ?? [];
        list.push(lead);
        leadIdx.byPhone.set(d, list);
      }
      report.leads_created++;
      rowReport.lead_action = 'created';
    } else {
      rowReport.lead_action = 'matched';
      rowReport.lead_id = lead.id;
      const leadPatch = {};
      if (row.source && !lead.source) leadPatch.source = row.source;
      if (normalizeEmail(row.email) && !lead.email) leadPatch.email = normalizeEmail(row.email);
      if (normalizePhone(row.phone) && !lead.phone) leadPatch.phone = normalizePhone(row.phone);
      if (Object.keys(leadPatch).length) {
        leadPatch.updated_at = new Date().toISOString();
        leadPatch.raw = {
          ...(typeof lead.raw === 'object' ? lead.raw : {}),
          company_report_enriched: true,
        };
        await patch('acquisition_leads', lead.id, leadPatch);
        report.leads_updated++;
        Object.assign(lead, leadPatch);
      }
    }

    const client = matchClient(row, allClients);
    rowReport.client_match = client?.name ?? null;

    if (client && lead.converted_client_id !== client.id) {
      await patch('acquisition_leads', lead.id, {
        converted_client_id: client.id,
        close_source: 'roster',
        updated_at: new Date().toISOString(),
      });
      lead.converted_client_id = client.id;
    }

    const offerType = 'Core Offer';
    const offerKey = companyKey;
    let offer = offerByKey.get(offerKey);
    if (!offer) {
      const offerRow = {
        lead_id: lead.id,
        offered_at: dateStarted,
        offer_type: offerType,
        is_closed: true,
        cash_collected: row.total_spent,
        offered_by: null,
        raw: {
          company_report: true,
          company_row_key: companyKey,
          client_num: row.client_num,
          reporting_type: row.reporting_type,
        },
        updated_at: new Date().toISOString(),
      };
      const ins = await insert('acquisition_offers', offerRow);
      if (ins.status !== 200 && ins.status !== 201) {
        rowReport.status = 'error';
        rowReport.error = `offer insert: ${ins.data}`;
        report.rows.push(rowReport);
        continue;
      }
      const parsed = JSON.parse(ins.data);
      offer = Array.isArray(parsed) ? parsed[0] : parsed;
      offerByKey.set(offerKey, offer);
      report.offers_created++;
      rowReport.offer_action = 'created';
    } else {
      report.offers_skipped++;
      rowReport.offer_action = 'exists';
      if (!DRY_RUN && offer.lead_id !== lead.id) {
        await patch('acquisition_offers', offer.id, { lead_id: lead.id });
      }
    }

    const existingClose = closeByCompanyKey.get(companyKey) ?? (client ? closeByClientId.get(client.id) : null);
    const mappingStatus = client ? 'mapped' : 'pending_client';
    const closeRow = {
      lead_id: lead.id,
      offer_id: offer.id,
      client_id: client?.id ?? null,
      closed_at: dateStarted,
      close_source: 'roster',
      mapping_status: mappingStatus,
      offer_type: offerType,
      cash_collected: row.total_spent,
      reporting_type: row.reporting_type,
      raw: {
        company_report: true,
        company_row_key: companyKey,
        client_num: row.client_num,
        csv_name: name,
      },
    };

    if (existingClose) {
      if (!DRY_RUN) {
        await patch('acquisition_closes', existingClose.id, closeRow);
      }
      report.closes_updated++;
      rowReport.close_action = 'updated';
      rowReport.close_id = existingClose.id;
    } else {
      const ins = await insert('acquisition_closes', closeRow);
      if (ins.status !== 200 && ins.status !== 201) {
        rowReport.status = 'error';
        rowReport.error = `close insert: ${ins.data}`;
        report.rows.push(rowReport);
        continue;
      }
      const parsed = JSON.parse(ins.data);
      const close = Array.isArray(parsed) ? parsed[0] : parsed;
      closeByCompanyKey.set(companyKey, close);
      if (client) closeByClientId.set(client.id, close);
      report.closes_created++;
      rowReport.close_action = 'created';
      rowReport.close_id = close.id;
    }

    if (client) {
      report.mapped++;
      rowReport.mapping = 'mapped';
    } else {
      report.pending++;
      rowReport.mapping = 'pending_client';
    }
    rowReport.status = 'ok';
    report.rows.push(rowReport);
  }

  const outPath = resolve(
    ROOT,
    `data/import/acquisition/company-closes-backfill-${new Date().toISOString().slice(0, 10)}.json`,
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(DRY_RUN ? '[dry-run]' : '[applied]', JSON.stringify({
    rows_total: report.rows_total,
    leads_created: report.leads_created,
    leads_updated: report.leads_updated,
    offers_created: report.offers_created,
    closes_created: report.closes_created,
    closes_updated: report.closes_updated,
    mapped: report.mapped,
    pending: report.pending,
  }, null, 2));
  console.log('Report:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

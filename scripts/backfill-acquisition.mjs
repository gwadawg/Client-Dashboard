#!/usr/bin/env node
/**
 * WM Acquisition backfill — sheet CSVs + optional GHL API + clients roster closes.
 *
 * Usage:
 *   node scripts/backfill-acquisition.mjs --dry-run
 *   node scripts/backfill-acquisition.mjs --apply
 *   node scripts/backfill-acquisition.mjs --apply --ghl   # also pull GHL contacts/appointments
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { supabaseRequest, fetchAll } from './lib/supabase-rest.mjs';
import { createGhlClient, ghlContactName, ghlCustomField } from './lib/ghl-api.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IMPORT_DIR = resolve(ROOT, 'data/import/acquisition');

const DRY_RUN = !process.argv.includes('--apply');
const PULL_GHL = process.argv.includes('--ghl');

const LEADS_CSV = resolve(IMPORT_DIR, 'WM _ Acquisition Report - Leads.csv');
const APPTS_CSV = resolve(IMPORT_DIR, 'WM _ Acquisition Report - Appointments.csv');
const OFFERS_CSV = resolve(IMPORT_DIR, 'WM _ Acquisition Report - Offers.csv');

function loadEnv() {
  const envPath = resolve(ROOT, '.env.local');
  if (!existsSync(envPath)) return {};
  return readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .reduce((acc, line) => {
      const [k, ...v] = line.split('=');
      if (k && v.length) acc[k.trim()] = v.join('=').trim();
      return acc;
    }, {});
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
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 12)).toISOString();
  return null;
}

function normPhone(raw) {
  if (!raw?.trim()) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d ? `+${d}` : null;
}

function normStatus(raw) {
  const s = (raw ?? '').trim().toUpperCase();
  if (s === 'Y') return 'showed';
  if (s === 'N') return 'no_show';
  if (s === 'C') return 'cancelled';
  if (s === 'X') return 'team_no_show';
  return 'pending';
}

function normApptType(raw) {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'intro') return 'intro';
  if (s === 'demo') return 'demo';
  if (s === 'follow up' || s === 'followup') return 'followup';
  if (s === 'organic') return 'organic';
  return 'other';
}

function parseCurrency(raw) {
  if (!raw?.trim()) return null;
  const n = Number(raw.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function sheetKey(...parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

async function withRetry(fn, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function upsertByEq(table, row, column, cache) {
  if (DRY_RUN) return { id: 'dry-run' };
  const val = row[column];
  if (val == null || val === '') return insertRow(table, row);

  const cachedId = cache?.get(val);
  if (cachedId) {
    const { status: ps, data: pd } = await withRetry(() =>
      supabaseRequest('PATCH', `/rest/v1/${table}?id=eq.${cachedId}`, row),
    );
    if (ps !== 200) throw new Error(`${table} patch ${ps}: ${pd}`);
    const parsed = JSON.parse(pd);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  }

  const { status, data } = await withRetry(() =>
    supabaseRequest(
      'GET',
      `/rest/v1/${table}?${column}=eq.${encodeURIComponent(val)}&select=id&limit=1`,
    ),
  );
  if (status !== 200) throw new Error(`${table} lookup ${status}: ${data}`);
  const existing = JSON.parse(data);
  if (existing.length > 0) {
    cache?.set(val, existing[0].id);
    const { status: ps, data: pd } = await withRetry(() =>
      supabaseRequest('PATCH', `/rest/v1/${table}?id=eq.${existing[0].id}`, row),
    );
    if (ps !== 200) throw new Error(`${table} patch ${ps}: ${pd}`);
    const parsed = JSON.parse(pd);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  }
  const inserted = await insertRow(table, row);
  if (inserted?.id) cache?.set(val, inserted.id);
  return inserted;
}

/** @deprecated use upsertByEq — PostgREST on_conflict fails on partial unique indexes */
async function upsertRow(table, row, onConflict) {
  return upsertByEq(table, row, onConflict);
}

async function insertRow(table, row) {
  if (DRY_RUN) return { id: 'dry-run' };
  const { status, data } = await withRetry(() => supabaseRequest('POST', `/rest/v1/${table}`, row));
  if (status !== 200 && status !== 201) throw new Error(`${table} insert ${status}: ${data}`);
  const parsed = JSON.parse(data);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

async function loadKeyCache(table, column) {
  const rows = await fetchAll(`/rest/v1/${table}?select=id,${column}`);
  const cache = new Map();
  for (const r of rows) {
    if (r[column]) cache.set(r[column], r.id);
  }
  return cache;
}

async function main() {
  const env = loadEnv();
  const report = {
    at: new Date().toISOString(),
    dry_run: DRY_RUN,
    leads: 0,
    appointments: 0,
    offers: 0,
    closes: 0,
    gaps: [],
    warnings: [],
  };

  const leadIdByGhl = new Map();
  const leadIdByPhone = new Map();
  const apptIdBySheetKey = new Map();

  const leadCacheByGhl = await loadKeyCache('acquisition_leads', 'ghl_contact_id');
  const leadCacheBySheet = await loadKeyCache('acquisition_leads', 'sheet_lead_key');
  const apptCacheByGhl = await loadKeyCache('acquisition_appointments', 'ghl_appointment_id');
  const apptCacheBySheet = await loadKeyCache('acquisition_appointments', 'sheet_appointment_key');
  const closeClientIds = new Set(
    (await fetchAll('/rest/v1/acquisition_closes?select=client_id')).map((r) => r.client_id).filter(Boolean),
  );

  // hydrate lead maps from DB for orphan appointment linking
  for (const [ghl, id] of leadCacheByGhl) leadIdByGhl.set(ghl, id);
  const allLeads = await fetchAll('/rest/v1/acquisition_leads?select=id,phone');
  for (const l of allLeads) {
    const phone = normPhone(l.phone);
    if (phone) leadIdByPhone.set(phone, l.id);
  }

  // ── Leads ─────────────────────────────────────────────────────────────────
  if (!existsSync(LEADS_CSV)) throw new Error(`Missing ${LEADS_CSV}`);
  const leadRows = parseCsv(readFileSync(LEADS_CSV, 'utf-8'));
  const leadHdr = leadRows[0];
  const li = (name) => leadHdr.indexOf(name);

  for (const r of leadRows.slice(1)) {
    if (!r[li('Date Created')]?.trim()) continue;
    const ghlId = r[li('ID')]?.trim() || null;
    const phone = normPhone(r[li('Phone Number')]);
    const createdAt = parseSheetDate(r[li('Date Created')]);
    const row = {
      ghl_contact_id: ghlId,
      sheet_lead_key: ghlId || sheetKey(phone, r[li('Lead Name')], createdAt),
      lead_name: r[li('Lead Name')]?.trim() || null,
      email: r[li('Email')]?.trim() || null,
      phone,
      source: r[li('Source')]?.trim() || null,
      offer_interest: r[li('Offer')]?.trim() || null,
      qualified: r[li('Qualified')]?.trim().toUpperCase() === 'Y' ? true : r[li('Qualified')]?.trim().toUpperCase() === 'N' ? false : null,
      ad_set: r[li('Ad Set')]?.trim() || null,
      ad_name: r[li('Ads')]?.trim() || null,
      created_at: createdAt,
      raw: { sheet: Object.fromEntries(leadHdr.map((h, i) => [h, r[i]])) },
    };

    const saved = ghlId
      ? await upsertByEq('acquisition_leads', row, 'ghl_contact_id', leadCacheByGhl)
      : await upsertByEq('acquisition_leads', row, 'sheet_lead_key', leadCacheBySheet);

    if (saved?.id) {
      if (ghlId) leadIdByGhl.set(ghlId, saved.id);
      if (phone) leadIdByPhone.set(phone, saved.id);
    }
    report.leads++;
  }

  // ── Appointments ────────────────────────────────────────────────────────────
  if (!existsSync(APPTS_CSV)) throw new Error(`Missing ${APPTS_CSV}`);
  const apptRows = parseCsv(readFileSync(APPTS_CSV, 'utf-8'));
  const ah = apptRows[0];
  const ai = (name) => ah.indexOf(name);

  for (const r of apptRows.slice(1)) {
    if (!r[ai('Date Created')]?.trim()) continue;
    const ghlLeadId = r[ai('Lead ID')]?.trim() || null;
    const phone = normPhone(r[ai('Phone Number')]);
    const leadId = (ghlLeadId && leadIdByGhl.get(ghlLeadId)) || (phone && leadIdByPhone.get(phone)) || null;
    const apptType = normApptType(r[ai('Appointment Type')]);
    const bookedAt = parseSheetDate(r[ai('Date Apt Created')]);
    const scheduledAt = parseSheetDate(r[ai('Date of Appt')]);
    const sk = sheetKey(ghlLeadId || phone, apptType, bookedAt, scheduledAt);

    const ghlApptId = r[ai('Appointment ID')]?.trim();
    const useGhlApptId = ghlApptId && ghlApptId !== '1' ? ghlApptId : null;

    const row = {
      lead_id: leadId,
      ghl_appointment_id: useGhlApptId,
      sheet_appointment_key: sk,
      appointment_type: apptType,
      booking_source: r[ai('Booking Source')]?.trim() || null,
      how_booked: r[ai('How was booked')]?.trim() || null,
      booked_at: bookedAt,
      scheduled_at: scheduledAt,
      status: normStatus(r[ai('Appt Status')]),
      qualified: r[ai('Qualified')]?.trim().toUpperCase() === 'Y' ? true : r[ai('Qualified')]?.trim().toUpperCase() === 'N' ? false : null,
      setter_name: r[ai('Setter')]?.trim() || null,
      call_taken_by: r[ai('Call Taken By')]?.trim() || null,
      lead_name: r[ai('Lead Name')]?.trim() || null,
      phone,
      raw: { sheet: Object.fromEntries(ah.map((h, i) => [h, r[i]])) },
    };

    if (!leadId) report.warnings.push(`appointment orphan: ${row.lead_name} ${phone}`);

    const saved = useGhlApptId
      ? await upsertByEq('acquisition_appointments', row, 'ghl_appointment_id', apptCacheByGhl)
      : await upsertByEq('acquisition_appointments', row, 'sheet_appointment_key', apptCacheBySheet);

    if (saved?.id) apptIdBySheetKey.set(sk, saved.id);
    report.appointments++;
  }

  // ── Offers ──────────────────────────────────────────────────────────────────
  if (!existsSync(OFFERS_CSV)) throw new Error(`Missing ${OFFERS_CSV}`);
  const offerRows = parseCsv(readFileSync(OFFERS_CSV, 'utf-8'));
  const oh = offerRows[0];
  const oi = (name) => oh.indexOf(name);

  for (const r of offerRows.slice(1)) {
    if (!r[oi('Date')]?.trim()) continue;
    const ghlLeadId = r[oi('Lead ID')]?.trim() || null;
    const phone = normPhone(r[oi('Phone Number')]);
    const leadId = (ghlLeadId && leadIdByGhl.get(ghlLeadId)) || (phone && leadIdByPhone.get(phone)) || null;
    const isClosed = (r[oi('Closed?')] ?? '').trim().toUpperCase() === 'Y';

    await insertRow('acquisition_offers', {
      lead_id: leadId,
      appointment_id: null,
      offered_at: parseSheetDate(r[oi('Date')]),
      offer_type: r[oi('Offer')]?.trim() || 'Core Offer',
      is_closed: isClosed,
      cash_collected: parseCurrency(r[oi('Cash Collected')]),
      setter_name: r[oi('Setter')]?.trim() || null,
      offered_by: r[oi('Offered By')]?.trim() || null,
      appointment_type: r[oi('Appointment Type')]?.trim() || null,
      recording_link: r[oi('Recording Link')]?.trim() || null,
      ghl_contact_link: r[oi('Link To Contact')]?.trim() || null,
      raw: { sheet: Object.fromEntries(oh.map((h, i) => [h, r[i]])) },
    });
    report.offers++;
  }

  // ── Closes from clients roster ─────────────────────────────────────────────
  const clients = await fetchAll('/rest/v1/clients?select=id,name,email,phone,date_signed,source&date_signed=not.is.null');
  for (const c of clients) {
    const phone = normPhone(c.phone);
    let leadId = null;
    if (c.email) {
      const { data } = await supabaseRequest(
        'GET',
        `/rest/v1/acquisition_leads?email=ilike.${encodeURIComponent(c.email)}&limit=1`,
      );
      if (data && data !== '[]') {
        const rows = JSON.parse(data);
        leadId = rows[0]?.id ?? null;
      }
    }
    if (!leadId && phone) leadId = leadIdByPhone.get(phone) ?? null;

    const closedAt = c.date_signed ? `${c.date_signed}T12:00:00.000Z` : null;
    if (!closedAt) continue;

    if (leadId) {
      if (!DRY_RUN) {
        await supabaseRequest('PATCH', `/rest/v1/acquisition_leads?id=eq.${leadId}`, {
          converted_client_id: c.id,
          close_source: 'roster',
        });
        if (!closeClientIds.has(c.id)) {
          await insertRow('acquisition_closes', {
            lead_id: leadId,
            client_id: c.id,
            closed_at: closedAt,
            close_source: 'roster',
            offer_type: 'Core Offer',
          });
          closeClientIds.add(c.id);
        }
      }
      report.closes++;
    } else {
      report.gaps.push({ type: 'roster_no_lead', client: c.name, date_signed: c.date_signed, source: c.source });
    }
  }

  // ── Optional GHL enrichment ─────────────────────────────────────────────────
  if (PULL_GHL) {
    const token = env.GHL_ACQUISITION_API_TOKEN || env.GHL_API_TOKEN;
    const locationId = env.GHL_ACQUISITION_LOCATION_ID || 'AcDN4LEPnbiqOCWzG1NH';
    if (!token) {
      report.warnings.push('GHL token missing — skip API pull');
    } else {
      const ghl = createGhlClient(token);
      let ghlCount = 0;
      for await (const contact of ghl.searchContacts(locationId, { pageLimit: 100 })) {
        ghlCount++;
        const id = contact.id;
        const source = ghlCustomField(contact, 'where did the lead come from') ?? contact.source;
        const row = {
          ghl_contact_id: id,
          lead_name: ghlContactName(contact),
          email: contact.email ?? null,
          phone: normPhone(contact.phone),
          source,
          created_at: contact.dateAdded ?? new Date().toISOString(),
          raw: { ghl: contact },
        };
        await upsertByEq('acquisition_leads', row, 'ghl_contact_id', leadCacheByGhl);
      }
      report.ghl_contacts = ghlCount;
    }
  }

  const outPath = resolve(IMPORT_DIR, `acquisition-backfill-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(DRY_RUN ? '[dry-run]' : '[applied]', JSON.stringify(report, null, 2));
  console.log('Report:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

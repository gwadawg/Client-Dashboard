import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseCsv } from './csv.mjs';
import {
  clientsLikelySameClient,
  clientNamesMatch,
  clientNameStem,
  normalizeEmail,
  normalizePhone,
  expectedIsLive,
} from './roster-match.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = resolve(__dirname, '../../data/import');

const TZ_MAP = {
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  EST: 'America/New_York',
  EDT: 'America/New_York',
};

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

export function loadJson(name) {
  return JSON.parse(readFileSync(resolve(IMPORT_DIR, name), 'utf-8'));
}

export function loadCsvRows(filename) {
  const text = readFileSync(resolve(IMPORT_DIR, filename), 'utf-8');
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map(cells => {
    const o = {};
    for (let i = 0; i < headers.length; i++) o[headers[i]] = (cells[i] ?? '').trim();
    return o;
  });
}

export function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Parse ClickUp prose dates, US slash dates, ISO, and Excel serial numbers. */
export function parseFlexibleDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // Reject obvious garbage (e.g. churn sheet "6" for Kevin Guttman).
  if (/^\d{1,2}$/.test(s)) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const serial = Number(s);
  if (/^\d{4,5}$/.test(s) && serial > 30000 && serial < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + serial);
    return epoch.toISOString().slice(0, 10);
  }

  const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) {
    let [, a, b, y] = slash;
    let year = Number(y);
    if (year < 100) year += 2000;
    const n1 = Number(a);
    const n2 = Number(b);
    let month;
    let day;
    if (n1 > 12) {
      day = n1;
      month = n2;
    } else if (n2 > 12) {
      month = n1;
      day = n2;
    } else {
      month = n1;
      day = n2;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const prose = s.match(
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/i,
  );
  if (prose) {
    const month = MONTHS[prose[1].toLowerCase()];
    if (month != null) {
      const day = Number(prose[2]);
      const year = Number(prose[3]);
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function parseStatesLicensed(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const inner = s.replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(',')
    .map(x => x.trim().toUpperCase())
    .filter(x => /^[A-Z]{2}$/.test(x));
}

export function mapTimezone(raw) {
  const key = String(raw ?? '').trim().toUpperCase();
  return TZ_MAP[key] ?? (key ? raw.trim() : null);
}

export function mapOldStatusToLifecycle(status, statusMap) {
  const key = String(status ?? '').trim().toLowerCase();
  return statusMap[key] ?? null;
}

export function extractStateFromLocation(location) {
  const s = String(location ?? '').trim();
  if (!s) return null;
  const us = s.match(/,\s*([A-Z]{2})\s*,?\s*USA?$/i);
  if (us) return us[1].toUpperCase();
  const parts = s.split(',').map(p => p.trim());
  if (parts.length >= 2 && /^[A-Z]{2}$/i.test(parts[parts.length - 2])) {
    return parts[parts.length - 2].toUpperCase();
  }
  return null;
}

export function resolveAlias(name, aliases) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return trimmed;
  return aliases[trimmed] ?? aliases[trimmed.toLowerCase()] ?? trimmed;
}

export function normalizeNameKey(name, aliases = {}) {
  const resolved = resolveAlias(name, aliases);
  return clientNameStem(resolved) || normalizeClientNameForMatch(resolved);
}

function normalizeClientNameForMatch(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hub-first merge: primary fields from hub, gaps filled from old DB. */
export function mergeClickUpSources(hubRows, oldRows, fieldMap, aliases) {
  const skip = new Set(fieldMap.skip_task_names ?? []);
  const hubByKey = new Map();
  const oldByKey = new Map();

  for (const row of hubRows) {
    const name = row[fieldMap.client_hub.task_name];
    if (!name || skip.has(name)) continue;
    hubByKey.set(normalizeNameKey(name, aliases), { hub: row, name });
  }
  for (const row of oldRows) {
    const name = row[fieldMap.old_database.task_name];
    if (!name || skip.has(name)) continue;
    oldByKey.set(normalizeNameKey(name, aliases), { old: row, name });
  }

  const keys = new Set([...hubByKey.keys(), ...oldByKey.keys()]);
  const merged = [];

  for (const key of keys) {
    const hubEntry = hubByKey.get(key);
    const oldEntry = oldByKey.get(key);
    const displayName = hubEntry?.name ?? oldEntry?.name ?? key;
    const hub = hubEntry?.hub ?? null;
    const old = oldEntry?.old ?? null;

    const clickup_task_id = hub?.[fieldMap.client_hub.task_id]
      || old?.[fieldMap.old_database.task_id]
      || null;

    merged.push({
      key,
      displayName,
      clickup_task_id,
      hub,
      old,
      in_hub: !!hub,
      in_old_db: !!old,
      old_task_id: old?.[fieldMap.old_database.task_id] ?? null,
      hub_task_id: hub?.[fieldMap.client_hub.task_id] ?? null,
    });
  }
  return merged;
}

export function buildClickUpPatch(merged, fieldMap) {
  const h = fieldMap.client_hub;
  const o = fieldMap.old_database;
  const hub = merged.hub ?? {};
  const old = merged.old ?? {};
  const statusMap = fieldMap.status_to_lifecycle ?? {};

  const patch = {};
  const meta = {};

  const dateSigned = parseFlexibleDate(hub[h.date_signed] || old[o.date_signed]);
  const launchDate = parseFlexibleDate(old[o.launch_date]);
  const phone = old[o.phone] || null;
  const nmls = old[o.nmls] || null;
  const website = old[o.website] || null;
  const timezone = mapTimezone(hub[h.timezone] || old[o.timezone]);
  const states =
    parseStatesLicensed(hub[h.states_licensed]) ||
    parseStatesLicensed(old[o.states_licensed]);
  const state = extractStateFromLocation(old[o.location]);
  const dailyAdspend = hub[h.daily_adspend] ? Number(hub[h.daily_adspend]) : null;
  const lifecycle = mapOldStatusToLifecycle(old[o.status], statusMap);

  if (merged.clickup_task_id) patch.clickup_task_id = merged.clickup_task_id;
  if (merged.displayName) patch.primary_contact_name = merged.displayName;
  if (dateSigned) patch.date_signed = dateSigned;
  if (launchDate) patch.launch_date = launchDate;
  if (phone) patch.phone = phone;
  if (nmls && nmls !== '0') patch.nmls = nmls;
  if (website) patch.website = website;
  if (timezone) patch.timezone = timezone;
  if (states?.length) patch.states_licensed = states;
  if (state) patch.state = state;
  if (dailyAdspend != null && !Number.isNaN(dailyAdspend)) patch.daily_adspend = dailyAdspend;
  if (lifecycle) {
    patch.lifecycle_status = lifecycle;
    const live = expectedIsLive(lifecycle);
    if (live !== null) patch.is_live = live;
  }

  if (hub[h.funnel_url]) meta.funnel_url = hub[h.funnel_url];
  if (hub[h.ad_account_url]) meta.ad_account_url = hub[h.ad_account_url];
  if (hub[h.client_stage]) meta.client_stage = hub[h.client_stage];
  if (hub[h.ad_status]) meta.ad_status = hub[h.ad_status];
  if (old[o.cs_status]) meta.cs_status = old[o.cs_status];
  if (merged.old_task_id && merged.hub_task_id && merged.old_task_id !== merged.hub_task_id) {
    meta.previous_clickup_task_id = merged.old_task_id;
  }

  return { patch, meta };
}

export function matchRosterClient(rosterClients, { clickup_task_id, name, phone, email, aliases = {} }) {
  const resolvedName = resolveAlias(name, aliases);

  if (clickup_task_id) {
    const byCu = rosterClients.find(c => c.clickup_task_id === clickup_task_id);
    if (byCu) return { client: byCu, method: 'clickup_task_id' };
  }

  const candidates = [];
  for (const c of rosterClients) {
    if (clientsLikelySameClient(c.name, resolvedName) || clientsLikelySameClient(c.primary_contact_name, resolvedName)) {
      candidates.push(c);
      continue;
    }
    if (c.primary_contact_name && clientsLikelySameClient(c.primary_contact_name, resolvedName)) {
      candidates.push(c);
    }
  }
  if (candidates.length === 1) return { client: candidates[0], method: 'name' };

  const normPhone = normalizePhone(phone);
  const normEmail = normalizeEmail(email);
  if (normPhone) {
    const byPhone = rosterClients.filter(c => normalizePhone(c.phone) === normPhone);
    if (byPhone.length === 1) return { client: byPhone[0], method: 'phone' };
    if (byPhone.length > 1 && candidates.length) {
      const overlap = byPhone.filter(c => candidates.some(x => x.id === c.id));
      if (overlap.length === 1) return { client: overlap[0], method: 'phone+name' };
    }
  }
  if (normEmail) {
    const byEmail = rosterClients.filter(
      c => normalizeEmail(c.email) === normEmail || normalizeEmail(c.billing_email) === normEmail,
    );
    if (byEmail.length === 1) return { client: byEmail[0], method: 'email' };
  }

  if (candidates.length > 1) return { client: null, method: 'ambiguous', candidates: candidates.map(c => ({ id: c.id, name: c.name })) };
  return { client: null, method: 'unmatched' };
}

/** Build final patch: only fill empty client fields unless forceFields has the key. */
export function diffClientPatch(client, patch, forceFields = new Set()) {
  const changes = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === '') continue;
    const current = client[key];
    const empty =
      current == null ||
      current === '' ||
      (Array.isArray(current) && current.length === 0);
    if (empty || forceFields.has(key)) {
      if (JSON.stringify(current) !== JSON.stringify(value)) {
        changes[key] = value;
      }
    }
  }
  return changes;
}

export function mapChurnReason(text, reasonMap) {
  const combined = String(text ?? '').toLowerCase();
  if (!combined.trim()) return reasonMap.default_reason_code ?? 'other';
  for (const { match, reason_code } of reasonMap.patterns ?? []) {
    if (combined.includes(match.toLowerCase())) return reason_code;
  }
  return reasonMap.default_reason_code ?? 'other';
}

export function formatChurnHistoryNote(responses) {
  const parts = [String(responses.client_feedback ?? '').trim()];
  const internal = String(responses.internal_notes ?? '').trim();
  if (internal) parts.push(`Internal: ${internal}`);
  return parts.filter(Boolean).join('\n\n');
}

export const CHURN_CHECKLIST_KEYS = [
  'exit_call_completed',
  'meta_ads_paused',
  'ghl_access_documented',
  'billing_finalized',
  'slack_channel_archived',
];

export function buildChurnResponses(row, reasonMap) {
  const reasonText = [row.reason, row.notes].filter(Boolean).join(' — ');
  const reason_code = mapChurnReason(reasonText, reasonMap);
  const checklist = {};
  for (const k of CHURN_CHECKLIST_KEYS) checklist[k] = true;

  return {
    reason_code,
    effective_churn_date: row.churn_date,
    client_feedback: row.reason?.trim() || row.notes?.trim() || 'Churn reason not recorded in legacy sheet.',
    internal_notes: row.notes?.trim() || null,
    recording_url: null,
    would_rejoin: null,
    checklist,
    backfill: true,
  };
}

/** Deduplicate churn rows by normalized name — keep richest / latest. */
export function dedupeChurnRows(rows, aliases) {
  const byKey = new Map();
  for (const row of rows) {
    const key = normalizeNameKey(row.name, aliases);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const score = r =>
      (r.reason ? 2 : 0) +
      (r.notes ? 1 : 0) +
      (r.churn_date ? 4 : 0) +
      (r.clickup_task_id?.startsWith('86') ? 3 : 0);
    if (score(row) > score(existing)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

/**
 * Refresh dedupe for Community First National Bank imports.
 * Identity priority: phone → email → first+last name.
 */
import { normalizePhone } from './waiz-import-helpers.mjs';

export const COMMUNITY_FIRST_CLIENT_NAME = 'Community First National Bank';

export function compactSpace(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

export function rawFields(ev) {
  if (!ev?.raw) return {};
  if (typeof ev.raw === 'object') return ev.raw;
  try {
    return JSON.parse(ev.raw);
  } catch {
    return {};
  }
}

/** phone → email → first+last name */
export function identityKeyFromParts({ lead_phone, lead_email, lead_name, first_name, last_name, raw }) {
  const phone = normalizePhone(lead_phone);
  if (phone) return `p:${phone}`;
  const email = compactSpace(lead_email).toLowerCase();
  if (email) return `e:${email}`;
  const r = raw ?? {};
  const first = compactSpace(first_name ?? r.first_name).toLowerCase();
  const last = compactSpace(last_name ?? r.last_name).toLowerCase();
  if (first && last) return `n:${first}|${last}`;
  const parts = compactSpace(lead_name).toLowerCase().split(' ').filter(Boolean);
  if (parts.length >= 2) return `n:${parts[0]}|${parts[parts.length - 1]}`;
  return '';
}

export function identityKey(ev) {
  const raw = rawFields(ev);
  return identityKeyFromParts({
    lead_phone: ev.lead_phone,
    lead_email: ev.lead_email,
    lead_name: ev.lead_name,
    first_name: raw.first_name,
    last_name: raw.last_name,
    raw,
  });
}

export function dedupeKey(ev) {
  const identity = identityKey(ev);
  if (!identity) return null;
  const dateOnly = (ev.occurred_at ?? '').slice(0, 10);
  const agent = compactSpace(ev.agent_name).toLowerCase();
  return [ev.client_id, ev.event_type, identity, dateOnly, agent].join('|');
}

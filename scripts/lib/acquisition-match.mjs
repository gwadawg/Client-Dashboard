/** Shared phone/email matching for acquisition backfills. */

export function normalizeEmail(raw) {
  if (!raw?.trim()) return null;
  return raw.trim().toLowerCase();
}

/** E.164-style phone stored on acquisition rows. */
export function normalizePhoneE164(raw) {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 0) return `+${digits}`;
  return null;
}

/** Last 10 digits for fuzzy phone match (US). */
export function phoneDigits10(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function extractGhlContactId(url) {
  if (!url) return null;
  const m = String(url).match(/\/contacts\/detail\/([^/?#\s]+)/i);
  const id = m?.[1]?.trim();
  if (!id || id.includes('...') || id.length < 8) return null;
  return id;
}

/** Pick best lead when multiple share a phone — prefer GHL-linked, then newest. */
export function pickBestLead(candidates) {
  if (!candidates?.length) return null;
  const sorted = [...candidates].sort((a, b) => {
    const aGhl = a.ghl_contact_id ? 1 : 0;
    const bGhl = b.ghl_contact_id ? 1 : 0;
    if (bGhl !== aGhl) return bGhl - aGhl;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return sorted[0];
}

/** Pick best GHL contact when duplicates share phone/email. */
export function pickBestGhlContact(candidates) {
  if (!candidates?.length) return null;
  const sorted = [...candidates].sort((a, b) => {
    const aT = Date.parse(a.dateUpdated ?? a.dateAdded ?? 0) || 0;
    const bT = Date.parse(b.dateUpdated ?? b.dateAdded ?? 0) || 0;
    return bT - aT;
  });
  return sorted[0];
}

export function buildLeadIndexes(leads) {
  const byId = new Map();
  const byGhl = new Map();
  const byPhone = new Map();
  const byEmail = new Map();

  for (const lead of leads) {
    byId.set(lead.id, lead);
    if (lead.ghl_contact_id) byGhl.set(lead.ghl_contact_id, lead);
    const p = phoneDigits10(lead.phone);
    if (p) {
      const list = byPhone.get(p) ?? [];
      list.push(lead);
      byPhone.set(p, list);
    }
    const e = normalizeEmail(lead.email);
    if (e) {
      const list = byEmail.get(e) ?? [];
      list.push(lead);
      byEmail.set(e, list);
    }
  }

  return { byId, byGhl, byPhone, byEmail };
}

export function buildGhlIndexes(contacts) {
  const byId = new Map();
  const byPhone = new Map();
  const byEmail = new Map();

  for (const contact of contacts) {
    const id = contact.id;
    if (!id) continue;
    byId.set(id, contact);
    const p = phoneDigits10(contact.phone);
    if (p) {
      const list = byPhone.get(p) ?? [];
      list.push(contact);
      byPhone.set(p, list);
    }
    const e = normalizeEmail(contact.email);
    if (e) {
      const list = byEmail.get(e) ?? [];
      list.push(contact);
      byEmail.set(e, list);
    }
  }

  return { byId, byPhone, byEmail };
}

export function resolveGhlContact(ghlIndex, { phone, email, ghlContactId }) {
  if (ghlContactId && ghlIndex.byId.has(ghlContactId)) {
    return ghlIndex.byId.get(ghlContactId);
  }
  const p = phoneDigits10(phone);
  if (p && ghlIndex.byPhone.has(p)) {
    return pickBestGhlContact(ghlIndex.byPhone.get(p));
  }
  const e = normalizeEmail(email);
  if (e && ghlIndex.byEmail.has(e)) {
    return pickBestGhlContact(ghlIndex.byEmail.get(e));
  }
  return null;
}

export function resolveLead(leadIndex, { phone, email, ghlContactId }) {
  if (ghlContactId && leadIndex.byGhl.has(ghlContactId)) {
    return leadIndex.byGhl.get(ghlContactId);
  }
  const p = phoneDigits10(phone);
  if (p && leadIndex.byPhone.has(p)) {
    return pickBestLead(leadIndex.byPhone.get(p));
  }
  const e = normalizeEmail(email);
  if (e && leadIndex.byEmail.has(e)) {
    return pickBestLead(leadIndex.byEmail.get(e));
  }
  return null;
}

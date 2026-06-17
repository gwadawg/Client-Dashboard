/**
 * Minimal GoHighLevel API v2 client for one-off import scripts.
 *
 * Requires GHL_API_TOKEN in .env.local — a Private Integration Token (agency
 * or location) with contacts.readonly scope.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export class GhlApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GhlApiError';
    this.status = status;
    this.body = body;
  }
}

export function createGhlClient(token, { delayMs = 120 } = {}) {
  if (!token?.trim()) {
    throw new Error(
      'Missing GHL_API_TOKEN in .env.local. Create a Private Integration Token in GHL (Settings → Integrations) with contacts.read scope.',
    );
  }

  async function request(method, path, { body, locationId } = {}) {
    const headers = {
      Authorization: `Bearer ${token.trim()}`,
      Version: GHL_VERSION,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(locationId ? { locationId } : {}),
    };

    const res = await fetch(`${GHL_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      throw new GhlApiError(
        `GHL ${method} ${path} → ${res.status}`,
        res.status,
        parsed,
      );
    }

    if (delayMs > 0) await sleep(delayMs);
    return parsed;
  }

  return {
    async getContact(contactId, locationId) {
      return request('GET', `/contacts/${encodeURIComponent(contactId)}`, { locationId });
    },

    /** Page through all contacts in a location (POST /contacts/search). */
    async *searchContacts(locationId, { pageLimit = 100, query } = {}) {
      let page = 1;
      for (;;) {
        const body = { locationId, page, pageLimit };
        if (query) body.query = query;
        const data = await request('POST', '/contacts/search', {
          locationId,
          body,
        });
        const contacts = data?.contacts ?? [];
        for (const c of contacts) yield c;
        if (!contacts.length || contacts.length < pageLimit) break;
        const next = data?.meta?.nextPage ?? data?.meta?.next_page ?? null;
        page = typeof next === 'number' && next > page ? next : page + 1;
      }
    },

    /**
     * Calendar appointments for a location in a date range.
     * Tries epoch-ms query params first, then ISO strings.
     */
    async listCalendarEvents(locationId, startTime, endTime, { calendarId } = {}) {
      const startMs = startTime.getTime();
      const endMs = endTime.getTime();
      const calParam = calendarId
        ? `&calendarId=${encodeURIComponent(calendarId)}`
        : '';
      const attempts = [
        `/calendars/events?locationId=${encodeURIComponent(locationId)}&startTime=${startMs}&endTime=${endMs}${calParam}`,
        `/calendars/events?locationId=${encodeURIComponent(locationId)}&startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}${calParam}`,
      ];
      let lastErr;
      for (const path of attempts) {
        try {
          const data = await request('GET', path, { locationId });
          return data?.events ?? data?.appointments ?? data ?? [];
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr;
    },

    /** Page through every calendar in a location and merge appointment events. */
    async listAllCalendarEvents(locationId, startTime, endTime) {
      const calData = await request(
        'GET',
        `/calendars/?locationId=${encodeURIComponent(locationId)}`,
        { locationId },
      );
      const calendars = calData?.calendars ?? [];
      const merged = [];
      for (const cal of calendars) {
        if (!cal?.id) continue;
        const events = await this.listCalendarEvents(locationId, startTime, endTime, {
          calendarId: cal.id,
        });
        if (Array.isArray(events)) merged.push(...events);
      }
      return merged;
    },

    async checkScopes(locationId) {
      const out = { locationId, contacts: false, calendars: false, detail: {} };
      try {
        await request('POST', '/contacts/search', {
          locationId,
          body: { locationId, page: 1, pageLimit: 1 },
        });
        out.contacts = true;
      } catch (e) {
        out.detail.contacts = e instanceof GhlApiError ? e.body : String(e);
      }
      try {
        const now = Date.now();
        await request(
          'GET',
          `/calendars/events?locationId=${encodeURIComponent(locationId)}&startTime=${now - 86400000}&endTime=${now}`,
          { locationId },
        );
        out.calendars = true;
      } catch (e) {
        out.detail.calendars = e instanceof GhlApiError ? e.body : String(e);
      }
      return out;
    },
  };
}

/** Pull a custom field value by human label (case-insensitive substring). */
export function ghlCustomField(contact, ...labels) {
  const fields = contact?.customFields ?? contact?.customField ?? [];
  if (!Array.isArray(fields)) return null;
  const needles = labels.map((l) => l.toLowerCase());
  for (const f of fields) {
    const key = String(f.key ?? f.fieldKey ?? f.name ?? f.id ?? '').toLowerCase();
    const label = String(f.label ?? f.name ?? '').toLowerCase();
    const hit = needles.some((n) => key.includes(n) || label.includes(n));
    if (!hit) continue;
    const v = f.value ?? f.fieldValue;
    if (v == null || v === '') continue;
    return String(v).trim();
  }
  return null;
}

export function ghlContactName(contact) {
  if (!contact) return null;
  const direct = contact.name ?? contact.contactName;
  if (direct?.trim()) return direct.trim();
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ').trim();
  return null;
}

export function ghlTags(contact) {
  return (contact?.tags ?? []).map((t) => String(t).toLowerCase());
}

export function tagFlag(tags, ...needles) {
  return needles.some((n) => tags.some((t) => t.includes(n.toLowerCase())));
}

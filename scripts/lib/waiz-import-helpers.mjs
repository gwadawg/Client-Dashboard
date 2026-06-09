import { createHash } from 'crypto';

export function normalizePhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}

export function slugClient(name) {
  return name.trim().replace(/\s+/g, ' ');
}

export function extractGhlContactId(url) {
  if (!url) return '';
  const m = url.match(/\/contacts\/detail\/([^/?#\s]+)/i);
  return m?.[1]?.trim() ?? '';
}

export function extractGhlLocationId(url) {
  if (!url) return '';
  const m = url.match(/\/location\/([^/]+)\/contacts/i);
  return m?.[1]?.trim() ?? '';
}

export function isTruncatedContactId(id) {
  return !id || id.includes('...') || id.length < 10;
}

/** DD/MM or DD/MM/YYYY → ISO noon UTC (Bernardo May sheet). */
export function parseDateDMY(str, defaultYear = 2026) {
  const s = (str ?? '').trim();
  if (!s) return null;
  const full = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (full) {
    const day = Number(full[1]);
    const month = Number(full[2]);
    const year = Number(full[3]);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const short = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (short) {
    const day = Number(short[1]);
    const month = Number(short[2]);
    const d = new Date(Date.UTC(defaultYear, month - 1, day, 12, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** GHL location id → dashboard client name (fallback when DB has no events for contact). */
export const GHL_LOCATION_CLIENT = {
  spnoefyjwHjlZVNRmvgI: 'Community First National Bank',
  wKNRhfYaLqrVUCeyCSMJ: 'Jesse Beard',
  Q0fqw1niqLqy3x5GbUwM: 'Shane Thompson',
  EcXAjOgAvjdjEQlg7rg4: "Brian Thomas's Office",
  stKKPNXZcMtCq1PkvHrj: "John Fagan's Office",
  SWL7aKfJMRLwftRyOn93: 'Jameson Loans',
  KoO1KHDSqgfQWBgThXkB: "Christian Parada's Office",
  Ixy5QFDmgNJsq41hDHno: "JP Dauber's Office",
  RCYWWNt2AT0QyPe0F6ua: "Ken Adler's Office",
  GUx5bD71dlQslT7RrY9f: 'Ken Walker',
  '9RPB1kTYjQbanFmcVPRe': "Lawrence Berggoetz's Office",
  '6MXZx4Emm3iFf8DqDo1e': 'Angella Conrard',
  '9JdOiL4xyXYSZ0aXIkv6': "David Victorian's office",
};

export function clientNameFromLocation(locationId) {
  return GHL_LOCATION_CLIENT[locationId] ?? null;
}

function hashSlug(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

/** Stable lead_id: scoped per client; GHL id when available (matches transform-leads-csv). */
export function buildLeadId(clientName, phone, ghlContactId, leadName, occurredAt) {
  if (ghlContactId) return ghlContactId;
  const digits = normalizePhone(phone);
  const client = slugClient(clientName);
  if (digits) return `ldr:${client}:${digits}`;
  const name = (leadName ?? '').trim().toLowerCase();
  const date = (occurredAt ?? '').slice(0, 10);
  const basis = `${client}|${name}|${date}`;
  return `ldr:${client}:nophone:${hashSlug(basis)}`;
}

/** Case-insensitive header index. */
export function colIndex(headers, ...names) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const want = n.toLowerCase();
    const i = lower.indexOf(want);
    if (i >= 0) return i;
  }
  return -1;
}

export function getCell(row, idx) {
  return idx >= 0 ? (row[idx] ?? '').trim() : '';
}

/** MM-DD-YYYY or DD-MM-YYYY with optional HH:mm (24h). If both parts ≤12, uses US MM-DD. */
export function parseDashedDateTime(str) {
  const s = (str ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const year = Number(m[3]);
  let month;
  let day;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else {
    month = a;
    day = b;
  }
  let hour = 12;
  let minute = 0;
  let second = 0;
  if (m[4] !== undefined) {
    hour = Number(m[4]);
    minute = Number(m[5] ?? 0);
    second = Number(m[6] ?? 0);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** M/D/YYYY → ISO noon UTC */
export function parseDateMDY(str) {
  const s = (str ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  let hour = 12;
  let minute = 0;
  let second = 0;
  if (m[4] !== undefined) {
    hour = Number(m[4]);
    minute = Number(m[5] ?? 0);
    second = Number(m[6] ?? 0);
    const ap = (m[7] ?? '').toUpperCase();
    if (ap === 'PM' && hour < 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
  }
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Try M/D/YYYY H:MM:SS AM/PM, then full ISO, then M/D/YYYY date-only.
 */
export function parseDateTimeFlexible(str) {
  const s = (str ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const dashed = parseDashedDateTime(s);
  if (dashed) return dashed;
  return parseDateMDY(s);
}

/** Combine date-only (M/D/YYYY) + time string; if time empty, noon UTC on date. */
export function combineApptDateTime(dateStr, timeStr) {
  const datePart = (dateStr ?? '').trim();
  const timePart = (timeStr ?? '').trim();
  if (!datePart) return null;
  if (!timePart) return parseDateMDY(datePart);
  const combined = `${datePart} ${timePart}`.replace(/\s+/g, ' ').trim();
  return parseDateMDY(combined) ?? parseDateTimeFlexible(combined);
}

export const EVENT_IMPORT_HEADERS = [
  'event_type',
  'client_name',
  'occurred_at',
  'ghl_contact_id',
  'lead_id',
  'lead_name',
  'lead_phone',
  'lead_email',
  'is_qualified',
  'is_hot',
  'is_out_of_state',
  'duration_seconds',
  'is_pickup',
  'is_conversation',
  'call_status',
  'ad_name',
  'ad_set_name',
  'raw_json',
  'scheduled_at',
  'external_id',
  'calendar_name',
  'stage_booked',
  'agent_name',
  'direction',
  'recording_url',
  'call_summary',
  'phone_number_used',
  'speed_to_lead_seconds',
];

/** Empty row template for event CSV rows */
export function emptyEventRow() {
  return Object.fromEntries(EVENT_IMPORT_HEADERS.map((h) => [h, '']));
}

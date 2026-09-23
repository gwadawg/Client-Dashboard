/** GoHighLevel API v2 — Client Success contact updates (tags, fields). */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

export const GHL_OB_FORM_FILLED_TAG = 'OB Form Filled';
export const GHL_CLIENT_CHURNED_TAG_DEFAULT = 'Client Churned';

/**
 * Default custom field IDs for Waiz Client Success location (ShWJuggoS02PZidEL4HK).
 * Override any key via GHL_CS_OB_FIELD_MAP JSON on Railway.
 */
export const GHL_CS_OB_FIELD_DEFAULTS: Record<string, string> = {
  own_the_company: 'XTQlvxhlnW0yvrYW3F08',
  company_nmls: 'WCg6eoU6aMAxJidz55Vk',
  company_website: 'KExVt6BStyMuBPLcoC0b',
  other_user_information: 'DiZhv02a6JKvEZBualkn',
};

export type GhlContactCustomField = {
  id: string;
  field_value: string;
};

export type GhlContactUpdatePayload = {
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  companyName?: string;
  customFields?: GhlContactCustomField[];
};

export function getGhlClientChurnedTag(): string {
  return process.env.GHL_CLIENT_CHURNED_TAG?.trim() || GHL_CLIENT_CHURNED_TAG_DEFAULT;
}

export function getGhlApiToken(): string | undefined {
  return (
    process.env.GHL_CS_API_TOKEN?.trim() ||
    process.env.GHL_API_TOKEN?.trim() ||
    undefined
  );
}

/** Waiz CS location — same for all clients (GHL_CS_LOCATION_ID env). */
export function getGhlCsLocationId(): string | undefined {
  return process.env.GHL_CS_LOCATION_ID?.trim() || undefined;
}

/** Merge defaults with optional GHL_CS_OB_FIELD_MAP JSON overrides. */
export function parseGhlCsObFieldMap(): Record<string, string> {
  const out = { ...GHL_CS_OB_FIELD_DEFAULTS };
  const raw = process.env.GHL_CS_OB_FIELD_MAP?.trim();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
  } catch {
    console.error('[ghl-api] invalid GHL_CS_OB_FIELD_MAP JSON — using defaults');
  }
  return out;
}

export async function ghlAddContactTags(
  contactId: string,
  locationId: string,
  tags: string[],
): Promise<void> {
  const token = getGhlApiToken();
  if (!token) throw new Error('GHL_API_TOKEN is not configured');

  const res = await fetch(`${GHL_BASE}/contacts/${encodeURIComponent(contactId)}/tags`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Version: GHL_VERSION,
      locationId,
    },
    body: JSON.stringify({ tags }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GHL add tags failed (${res.status}): ${text}`);
  }
}

/**
 * Partial contact update — only sends provided keys. Does not clear unspecified fields.
 * Does not touch firstName / lastName / email / phone unless included in payload.
 */
export async function ghlUpdateContact(
  contactId: string,
  locationId: string,
  payload: GhlContactUpdatePayload,
): Promise<void> {
  const token = getGhlApiToken();
  if (!token) throw new Error('GHL_API_TOKEN is not configured');

  const body: Record<string, unknown> = {};
  if (payload.address1 !== undefined) body.address1 = payload.address1;
  if (payload.city !== undefined) body.city = payload.city;
  if (payload.state !== undefined) body.state = payload.state;
  if (payload.postalCode !== undefined) body.postalCode = payload.postalCode;
  if (payload.companyName !== undefined) body.companyName = payload.companyName;
  if (payload.customFields?.length) body.customFields = payload.customFields;

  if (Object.keys(body).length === 0) return;

  const res = await fetch(`${GHL_BASE}/contacts/${encodeURIComponent(contactId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Version: GHL_VERSION,
      locationId,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GHL update contact failed (${res.status}): ${text}`);
  }
}

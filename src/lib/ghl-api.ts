/** GoHighLevel API v2 — Client Success contact updates (tags, etc.). */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

export const GHL_OB_FORM_FILLED_TAG = 'OB form Filled';

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

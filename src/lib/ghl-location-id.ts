/**
 * Normalize pasted GHL location values.
 * Accepts a raw location id OR a full GHL dashboard URL and returns the id.
 */
export function extractGhlLocationId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const fromUrl = trimmed.match(/\/location\/([A-Za-z0-9_-]+)/i);
  if (fromUrl?.[1]) return fromUrl[1];

  // Already an id — reject obvious URLs that didn't match the path pattern.
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('/')) return null;

  return trimmed;
}

export function splitGhlLocationInput(raw: string | null | undefined): {
  ghl_location_id: string | null;
  ghl_subaccount_url: string | null;
} {
  if (raw == null) return { ghl_location_id: null, ghl_subaccount_url: null };
  const trimmed = String(raw).trim();
  if (!trimmed) return { ghl_location_id: null, ghl_subaccount_url: null };

  const id = extractGhlLocationId(trimmed);
  const url = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : id
      ? `https://app.gohighlevel.com/v2/location/${id}`
      : null;

  return { ghl_location_id: id, ghl_subaccount_url: url };
}

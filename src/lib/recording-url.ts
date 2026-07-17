/** First http(s) URL in a string (GHL often joins multiple attachments with commas). */
const HTTP_URL_RE = /https?:\/\/[^\s,]+/i;

/**
 * Extract a single playable recording URL from GHL/Make payload shapes.
 * Arrays and comma-joined attachment strings are common; we keep only the first URL.
 */
export function firstHttpUrl(value: unknown): string | null {
  if (value == null) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstHttpUrl(item);
      if (url) return url;
    }
    return null;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (
      firstHttpUrl(obj.url) ??
      firstHttpUrl(obj.recordingUrl) ??
      firstHttpUrl(obj.recording_url) ??
      firstHttpUrl(obj.href)
    );
  }

  if (typeof value === 'number' || typeof value === 'boolean') return null;

  const s = String(value).trim();
  if (!s) return null;

  const match = s.match(HTTP_URL_RE);
  if (!match?.[0]) return null;

  // Drop trailing punctuation sometimes left after splitting joined fields
  return match[0].replace(/[)\]}>'"]+$/g, '');
}

export function recordingUrlField(value: unknown): string | null {
  return firstHttpUrl(value);
}

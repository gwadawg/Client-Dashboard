/** Public app base URL for magic links and Slack messages. */

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function isLocalHostUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return LOCAL_HOST_RE.test(host);
  } catch {
    return LOCAL_HOST_RE.test(value);
  }
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return stripTrailingSlash(trimmed);
  return stripTrailingSlash(`https://${trimmed}`);
}

/**
 * Prefer a non-local explicit URL, then Railway public domain, then production
 * custom domain. Ignores localhost NEXT_PUBLIC_APP_URL so client-facing links
 * never ship as https://localhost:8080 in production.
 */
export function getAppBaseUrl(requestOrigin?: string | null): string {
  const fromRequest = normalizeBaseUrl(requestOrigin);
  if (fromRequest && !isLocalHostUrl(fromRequest)) return fromRequest;

  const explicit = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit && !isLocalHostUrl(explicit)) return explicit;

  const railway = normalizeBaseUrl(process.env.RAILWAY_PUBLIC_DOMAIN);
  if (railway && !isLocalHostUrl(railway)) return railway;

  const appUrl = normalizeBaseUrl(process.env.APP_URL);
  if (appUrl && !isLocalHostUrl(appUrl)) return appUrl;

  return 'https://os.waizmedia.net';
}

/** Resolve public origin from a request (forwarded host) or fall back to env. */
export function getAppBaseUrlFromRequest(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.get('host')?.trim();
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    (host && !isLocalHostUrl(host) ? 'https' : null);

  if (host && proto) {
    return getAppBaseUrl(`${proto}://${host}`);
  }

  try {
    return getAppBaseUrl(new URL(req.url).origin);
  } catch {
    return getAppBaseUrl();
  }
}

/** Public app base URL for magic links and Slack messages. */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway.replace(/\/$/, '')}`;

  return 'https://wm-os-production.up.railway.app';
}

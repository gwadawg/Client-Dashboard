/** DSCR landing factory. v1 does not publish reverse-mortgage pages. */

export const DSCR_GITHUB_REPO = "gwadawg/dscr-experts";
export const DSCR_SITE_URL = "https://dscrexperts.com";
export const LANDING_SCHEMA_VERSION = "2026-10-07";

export const LANDING_THEMES = ["theme-1", "theme-light", "theme-custom"] as const;
export type LandingTheme = (typeof LANDING_THEMES)[number];

export const LANDING_THEME_LABELS: Record<LandingTheme, string> = {
  "theme-1": "Dark",
  "theme-light": "Light",
  "theme-custom": "Dark with your color",
};

export const DEMO_SLUGS = ["demo-lo", "demo-light", "demo-custom"] as const;

/** Matches scripts/build-clients.mjs RESERVED_SLUGS in dscr-experts. */
export const RESERVED_SLUGS = new Set([
  "api",
  "assets",
  "audits",
  "brand_assets",
  "clients",
  "docs",
  "guides",
  "index",
  "node_modules",
  "privacy",
  "robots",
  "scripts",
  "sitemap",
  "sms-terms",
  "themes",
]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DEFAULT_TAGLINE = "DSCR refinance for rental investors";

export function landingRepo(): string {
  return process.env.LANDING_DSCR_GITHUB_REPO?.trim() || DSCR_GITHUB_REPO;
}

export function landingPageUrl(slug: string): string {
  return `${DSCR_SITE_URL}/${slug}/`;
}

export function thankYouPageUrl(slug: string): string {
  return `${DSCR_SITE_URL}/${slug}/thank-you`;
}

export function yamlPath(slug: string): string {
  return `clients/${slug}.yaml`;
}

export function headshotPath(slug: string, ext: "png" | "jpg" | "jpeg" | "webp"): string {
  return `brand_assets/clients/${slug}/headshot.${ext}`;
}

/**
 * Virtual business card — field shape from frozen RM/DSCR template contracts.
 */

export type VirtualCardProduct = "rm" | "dscr";

export type VirtualCardSecondaryLink = {
  label: string;
  href: string;
  sublabel?: string;
};

export type VirtualCard = {
  /** Path slug: loanofficer.me/{slug} */
  slug: string;
  /** Mr. Waiz clients.id when known */
  clientId?: string;

  fullName: string;
  title: string;
  company: string;
  nmls: string;
  statesLicensed: string[];
  phone: string;
  email: string;
  headshotUrl: string;

  /** One short line under the name — RM/DSCR appropriate */
  valueLine: string;

  product: VirtualCardProduct;

  /** Style pack id from packs/{product}-packs.json */
  stylePackId: string;

  /**
   * Self-booking calendar URL. Optional — when absent / booking not needed,
   * Book CTAs hide on card and educate.
   */
  bookingUrl?: string;
  bookingLabel?: string;

  /** Optional soft note on the educate page */
  loNote?: string;

  /** Optional CSS accent override (legacy / preview). Packs supply defaults. */
  accentColor?: string;

  /** Optional below-fold links; system always adds /learn when published */
  secondaryLinks?: VirtualCardSecondaryLink[];
};

export const VIRTUAL_CARD_PUBLIC_HOST = "https://loanofficer.me";

export function cardPublicUrl(slug: string): string {
  return `${VIRTUAL_CARD_PUBLIC_HOST}/${slug.trim().toLowerCase()}`;
}

export function learnPublicUrl(slug: string): string {
  return `${cardPublicUrl(slug)}/learn`;
}

export function learnPath(slug: string): string {
  return `/${slug.trim().toLowerCase()}/learn`;
}

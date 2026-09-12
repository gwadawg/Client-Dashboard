/**
 * Client Launch Kit — shared types.
 *
 * Block vocabulary mirrors the Wm-os `content.json` used by the minimax-pdf fallback
 * (docs/client-fulfillment/onboarding/assets/launch-kit-sample/content.json) so copy
 * can be ported 1:1 between the two renderers.
 */

export type KitTextBlockType = 'h1' | 'h2' | 'h3' | 'body' | 'bullet' | 'numbered' | 'callout' | 'caption';

export type KitBlock =
  | { type: KitTextBlockType; text: string }
  | { type: 'table'; headers: string[]; rows: string[][]; col_widths?: number[] }
  | { type: 'pagebreak' }
  | { type: 'spacer' }
  | { type: 'divider' };

/** Product axis — what the client sells. */
export type KitProduct = 'rm' | 'dscr';

/** Fulfillment axis — who works new leads. `waiz` = our call center / Laura; `client` = LO or their VA. */
export type KitDialOwner = 'waiz' | 'client';

export type KitVariant = {
  product: KitProduct;
  dialOwner: KitDialOwner;
};

export const KIT_PRODUCT_LABELS: Record<KitProduct, string> = {
  rm: 'Reverse mortgage',
  dscr: 'DSCR',
};

export const KIT_DIAL_OWNER_LABELS: Record<KitDialOwner, string> = {
  waiz: 'Waiz works the leads (call center / Laura)',
  client: 'Client works the leads (LO / VA) — gets playbooks',
};

export type KitCoverMeta = {
  title: string;
  subtitle: string;
  abstract: string;
  clientName: string;
  productLabel: string;
  goLiveLabel: string;
  dateLabel: string;
  version: number;
  templateVersion: string;
};

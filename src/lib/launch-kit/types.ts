/**
 * Client Launch Kit — shared types.
 *
 * Block vocabulary mirrors the Wm-os `content.json` used by the minimax-pdf fallback
 * (docs/client-fulfillment/onboarding/assets/launch-kit-sample/content.json) so copy
 * can be ported 1:1 between the two renderers.
 */

export type KitTextBlockType = 'h1' | 'h2' | 'h3' | 'body' | 'bullet' | 'numbered' | 'callout' | 'caption';

/**
 * Visual treatment for a `table` block. Optional and renderer-only: the minimax fallback
 * ignores it and draws a plain table, so copy still ports 1:1.
 *
 *   grid       default; refined table with small header labels and hairline rows
 *   kv         label / value rows, no header; http(s) values render as clickable links
 *   checklist  kv with a tick box per row (client confirms each item on the launch call)
 *   receipt    large-value tiles in one row (what we have on file)
 *   steps      vertical stepper: [stage, what they experience, what you do]
 *   compare    two-panel contrast: [everyone else, Waiz]
 *   timeline   horizontal milestones: [label, focus]
 *   rhythm     day strip: [block, what happens]
 *   toc        contents: [number, title, question]
 */
export type KitTableVariant =
  | 'grid'
  | 'kv'
  | 'checklist'
  | 'receipt'
  | 'steps'
  | 'compare'
  | 'timeline'
  | 'rhythm'
  | 'toc';

export type KitBlock =
  | { type: KitTextBlockType; text: string }
  | { type: 'table'; headers: string[]; rows: string[][]; col_widths?: number[]; variant?: KitTableVariant }
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
  client: 'Client works the leads (LO / VA), gets playbooks',
};

export type KitCoverMeta = {
  title: string;
  subtitle: string;
  abstract: string;
  /** First name for the cover hero: "Welcome, {welcomeName}" */
  welcomeName: string;
  /** One short paragraph under the cover name. */
  lead: string;
  clientName: string;
  productLabel: string;
  goLiveLabel: string;
  dateLabel: string;
  version: number;
  templateVersion: string;
};

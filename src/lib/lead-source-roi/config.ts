import type { CompareState, SideInputs } from "./types";

export const TOOL_TITLE = "Lead source ROI";
export const TOOL_SUBTITLE =
  "Same ad budget. Better economics downstream. DSCR lead-source bake-off.";

export const PUBLIC_DISCLAIMER =
  "Illustrative model for planning discussion. Results vary. Not a guarantee of performance or ROI.";

/** Placeholder demo — retune when DSCR deliverable bands are approved. */
export const DEMO_CURRENT: SideInputs = {
  ad_spend: 10_000,
  cpl: 75,
  leads: 0, // resolved by driver
  driver: "cpl",
  contact_rate_pct: 20,
  close_rate_pct: 15,
  avg_commission: 4_500,
  program_fee: 0,
};

export const DEMO_WAIZ: SideInputs = {
  ad_spend: 10_000,
  cpl: 55,
  leads: 0,
  driver: "cpl",
  contact_rate_pct: 32,
  close_rate_pct: 18,
  avg_commission: 4_500,
  program_fee: 3_500,
};

export const DEFAULT_COMPARE_STATE: CompareState = {
  current: { ...DEMO_CURRENT },
  waiz: { ...DEMO_WAIZ },
  link_spend: true,
  link_commission: true,
  include_fees: false,
};

/**
 * Waiz deliverable bands for captions + worst/best packs.
 * CPL: worst = higher $; best = lower $.
 * Rates: worst = lower %; best = higher %.
 */
export const WAIZ_RANGES = {
  cpl: { worst: 70, best: 45 },
  contact_rate_pct: { worst: 25, best: 40 },
  close_rate_pct: { worst: 14, best: 22 },
} as const;

export const FIELD_TOOLTIPS: Record<
  string,
  { definition: string; why: string }
> = {
  ad_spend: {
    definition: "Monthly media budget on this lead source.",
    why: "Locks the fair apples-to-apples spend story.",
  },
  cpl: {
    definition: "Cost per lead = ad spend ÷ leads.",
    why: "Lower CPL only wins if contact and close hold up.",
  },
  leads: {
    definition: "Leads generated at this spend and CPL.",
    why: "Top of the contact → close → commission chain.",
  },
  contact_rate_pct: {
    definition: "Share of leads that became a real conversation.",
    why: "Pickup and answer quality drive cost per conversation.",
  },
  close_rate_pct: {
    definition: "Share of conversations that fund or close.",
    why: "Close is measured on people spoken with — not raw leads.",
  },
  avg_commission: {
    definition: "Average gross commission per closed deal.",
    why: "Turns deals into dollars so net ROI is concrete.",
  },
  program_fee: {
    definition: "Monthly program or vendor fee (loaded cost).",
    why: "Shows full-loaded ROI when you include platform cost.",
  },
};

export function rangeCaption(
  field: keyof typeof WAIZ_RANGES,
): string {
  const r = WAIZ_RANGES[field];
  if (field === "cpl") {
    return `Typical deliverable: $${r.best}–$${r.worst}`;
  }
  return `Typical deliverable: ${r.worst}–${r.best}%`;
}

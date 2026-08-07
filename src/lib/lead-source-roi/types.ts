export type VolumeDriver = "cpl" | "leads";

export type SideKey = "current" | "waiz";

/** One side of the bake-off (Current or With Waiz). */
export type SideInputs = {
  ad_spend: number;
  cpl: number;
  leads: number;
  driver: VolumeDriver;
  /** 0–100 */
  contact_rate_pct: number;
  /** 0–100 — of contacts, not of leads */
  close_rate_pct: number;
  avg_commission: number;
  /** Used only when compare.include_fees is true */
  program_fee: number;
};

export type CompareState = {
  current: SideInputs;
  waiz: SideInputs;
  link_spend: boolean;
  /**
   * @deprecated Always independent — keep for URL decode of old `lc` flag only.
   * Commission is never forced equal between columns.
   */
  link_commission: boolean;
  include_fees: boolean;
};

export type SideOutcomes = {
  leads: number;
  contacts: number;
  deals: number;
  gross_commission: number;
  investment: number;
  net_commission: number;
  /** gross / investment; null if investment <= 0 */
  roi_multiple: number | null;
  /** (gross - investment) / investment; null if investment <= 0 */
  roi_pct: number | null;
  /** ad_spend / contacts; null if contacts <= 0 */
  cost_per_conversation: number | null;
  /** investment / contacts when fees matter; same as above if fees off */
  cost_per_conversation_loaded: number | null;
};

export type DeltaOutcomes = {
  contacts: number;
  deals: number;
  net_commission: number;
  cost_per_conversation: number | null;
  roi_multiple: number | null;
  roi_pct: number | null;
};

export type CompareResult = {
  current: SideOutcomes;
  waiz: SideOutcomes;
  waiz_worst: SideOutcomes;
  waiz_best: SideOutcomes;
  delta: DeltaOutcomes;
};

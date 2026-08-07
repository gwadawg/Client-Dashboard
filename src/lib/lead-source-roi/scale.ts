import { simulateSide } from "./math";
import type { CompareState, SideInputs } from "./types";

/** Spend multipliers used for the scale ladder. */
export const SPEND_MULTIPLIERS = [0.5, 1, 1.5, 2, 3] as const;

export type ScaleRung = {
  multiplier: number;
  spend: number;
  label: string;
  currentNet: number;
  waizNet: number;
  currentDeals: number;
  waizDeals: number;
  deltaNet: number;
  waizRoiMultiple: number | null;
};

function scaledSide(side: SideInputs, spend: number): SideInputs {
  // CPL/rates hold; volume scales with budget.
  return { ...side, ad_spend: spend, driver: "cpl", leads: 0 };
}

/**
 * Same rates, more budget: what each side returns as spend scales.
 * Program fee (when on) is held flat — it does not scale with media.
 */
export function buildSpendLadder(
  state: CompareState,
  multipliers: readonly number[] = SPEND_MULTIPLIERS,
): ScaleRung[] {
  const baseSpend = state.current.ad_spend || 0;
  return multipliers.map((m) => {
    const spend = baseSpend * m;
    const current = simulateSide(scaledSide(state.current, spend), state.include_fees);
    const waiz = simulateSide(scaledSide(state.waiz, spend), state.include_fees);
    return {
      multiplier: m,
      spend,
      label: `${m}×`,
      currentNet: current.net_commission,
      waizNet: waiz.net_commission,
      currentDeals: current.deals,
      waizDeals: waiz.deals,
      deltaNet: waiz.net_commission - current.net_commission,
      waizRoiMultiple: waiz.roi_multiple,
    };
  });
}

export type ContactCurvePoint = {
  contactRatePct: number;
  costPerConversation: number | null;
};

/**
 * Cost per conversation across a sweep of contact rates at fixed spend.
 * Shows why a cheap lead with poor pickup is the expensive one.
 */
export function buildContactRateCurve(
  spend: number,
  leads: number,
  from = 5,
  to = 60,
  step = 5,
): ContactCurvePoint[] {
  const points: ContactCurvePoint[] = [];
  for (let pct = from; pct <= to; pct += step) {
    const conversations = leads * (pct / 100);
    points.push({
      contactRatePct: pct,
      costPerConversation: conversations > 0 ? spend / conversations : null,
    });
  }
  return points;
}

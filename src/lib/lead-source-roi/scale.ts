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

export type EffortAssumptions = {
  /** Dials + texts spent working a single lead. */
  touchesPerLead: number;
  /** Minutes of rep time per touch (dial, voicemail, text). */
  minutesPerTouch: number;
};

export const DEFAULT_EFFORT: EffortAssumptions = {
  touchesPerLead: 6,
  minutesPerTouch: 2,
};

export type EffortResult = {
  contactRatePct: number;
  /** Leads you must work to land one live conversation. */
  leadsPerConversation: number | null;
  /** Dials + texts to land one live conversation. */
  touchesPerConversation: number | null;
  /** Rep hours to land one live conversation. */
  hoursPerConversation: number | null;
  /** Rep hours across the whole lead batch. */
  totalHours: number;
  conversations: number;
};

/** Outreach workload implied by a contact rate — lower rate = more grind per conversation. */
export function computeEffort(
  leads: number,
  contactRatePct: number,
  assumptions: EffortAssumptions = DEFAULT_EFFORT,
): EffortResult {
  const rate = Math.min(100, Math.max(0, contactRatePct)) / 100;
  const safeLeads = Math.max(0, leads || 0);
  const conversations = safeLeads * rate;
  const touchesPerLead = Math.max(0, assumptions.touchesPerLead || 0);
  const minutesPerTouch = Math.max(0, assumptions.minutesPerTouch || 0);
  const totalHours = (safeLeads * touchesPerLead * minutesPerTouch) / 60;

  if (rate <= 0) {
    return {
      contactRatePct,
      leadsPerConversation: null,
      touchesPerConversation: null,
      hoursPerConversation: null,
      totalHours,
      conversations: 0,
    };
  }

  const leadsPerConversation = 1 / rate;
  const touchesPerConversation = leadsPerConversation * touchesPerLead;
  return {
    contactRatePct,
    leadsPerConversation,
    touchesPerConversation,
    hoursPerConversation: (touchesPerConversation * minutesPerTouch) / 60,
    totalHours,
    conversations,
  };
}

export type ContactCurvePoint = {
  contactRatePct: number;
  costPerConversation: number | null;
  touchesPerConversation: number | null;
};

/**
 * Cost + grind per conversation across a sweep of contact rates at fixed spend.
 * Shows why a cheap lead with poor pickup is the expensive one.
 */
export function buildContactRateCurve(
  spend: number,
  leads: number,
  assumptions: EffortAssumptions = DEFAULT_EFFORT,
  from = 5,
  to = 60,
  step = 5,
): ContactCurvePoint[] {
  const points: ContactCurvePoint[] = [];
  for (let pct = from; pct <= to; pct += step) {
    const conversations = leads * (pct / 100);
    const effort = computeEffort(leads, pct, assumptions);
    points.push({
      contactRatePct: pct,
      costPerConversation: conversations > 0 ? spend / conversations : null,
      touchesPerConversation: effort.touchesPerConversation,
    });
  }
  return points;
}

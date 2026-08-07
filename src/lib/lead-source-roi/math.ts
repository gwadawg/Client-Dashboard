import { WAIZ_RANGES } from "./config";
import type {
  CompareResult,
  CompareState,
  DeltaOutcomes,
  SideInputs,
  SideOutcomes,
} from "./types";

export function resolveVolume(side: SideInputs): { leads: number; cpl: number } {
  const spend = Math.max(0, side.ad_spend || 0);
  if (side.driver === "leads") {
    const leads = Math.max(0, side.leads || 0);
    const cpl = leads > 0 ? spend / leads : 0;
    return { leads, cpl };
  }
  const cpl = Math.max(0, side.cpl || 0);
  const leads = cpl > 0 ? spend / cpl : 0;
  return { leads, cpl };
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function simulateSide(
  side: SideInputs,
  includeFees: boolean,
): SideOutcomes {
  const { leads, cpl: _cpl } = resolveVolume(side);
  const contact = clampPct(side.contact_rate_pct) / 100;
  const close = clampPct(side.close_rate_pct) / 100;
  const contacts = leads * contact;
  const deals = contacts * close;
  const gross = deals * Math.max(0, side.avg_commission || 0);
  const fee = includeFees ? Math.max(0, side.program_fee || 0) : 0;
  const investment = Math.max(0, side.ad_spend || 0) + fee;

  const roi_multiple = investment > 0 ? gross / investment : null;
  const roi_pct = investment > 0 ? (gross - investment) / investment : null;
  const cost_per_conversation =
    contacts > 0 ? Math.max(0, side.ad_spend || 0) / contacts : null;
  const cost_per_conversation_loaded =
    contacts > 0 ? investment / contacts : null;

  return {
    leads,
    contacts,
    deals,
    gross_commission: gross,
    investment,
    net_commission: gross - investment,
    roi_multiple,
    roi_pct,
    cost_per_conversation,
    cost_per_conversation_loaded,
  };
}

export function applyWaizPack(
  base: SideInputs,
  pack: "worst" | "best",
): SideInputs {
  const r = WAIZ_RANGES;
  return {
    ...base,
    driver: "cpl",
    cpl: pack === "worst" ? r.cpl.worst : r.cpl.best,
    contact_rate_pct:
      pack === "worst"
        ? r.contact_rate_pct.worst
        : r.contact_rate_pct.best,
    close_rate_pct:
      pack === "worst" ? r.close_rate_pct.worst : r.close_rate_pct.best,
    // leads discarded; driver cpl recomputes
    leads: 0,
  };
}

function deltaOf(
  current: SideOutcomes,
  waiz: SideOutcomes,
): DeltaOutcomes {
  const dCpc =
    current.cost_per_conversation != null &&
    waiz.cost_per_conversation != null
      ? waiz.cost_per_conversation - current.cost_per_conversation
      : null;
  const dMult =
    current.roi_multiple != null && waiz.roi_multiple != null
      ? waiz.roi_multiple - current.roi_multiple
      : null;
  const dPct =
    current.roi_pct != null && waiz.roi_pct != null
      ? waiz.roi_pct - current.roi_pct
      : null;
  return {
    contacts: waiz.contacts - current.contacts,
    deals: waiz.deals - current.deals,
    net_commission: waiz.net_commission - current.net_commission,
    cost_per_conversation: dCpc,
    roi_multiple: dMult,
    roi_pct: dPct,
  };
}

export function simulateCompare(state: CompareState): CompareResult {
  const current = simulateSide(state.current, state.include_fees);
  const waiz = simulateSide(state.waiz, state.include_fees);
  const waiz_worst = simulateSide(
    applyWaizPack(state.waiz, "worst"),
    state.include_fees,
  );
  const waiz_best = simulateSide(
    applyWaizPack(state.waiz, "best"),
    state.include_fees,
  );
  return {
    current,
    waiz,
    waiz_worst,
    waiz_best,
    delta: deltaOf(current, waiz),
  };
}

import { DEFAULT_COMPARE_STATE } from "./config";
import { resolveVolume } from "./math";
import type { CompareState, SideInputs, SideKey, VolumeDriver } from "./types";

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function finite(n: unknown, fallback = 0): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : fallback;
}

export function normalizeSide(raw: SideInputs): SideInputs {
  const driver: VolumeDriver = raw.driver === "leads" ? "leads" : "cpl";
  const base: SideInputs = {
    ad_spend: Math.max(0, finite(raw.ad_spend)),
    cpl: Math.max(0, finite(raw.cpl)),
    leads: Math.max(0, finite(raw.leads)),
    driver,
    contact_rate_pct: clampPct(finite(raw.contact_rate_pct)),
    close_rate_pct: clampPct(finite(raw.close_rate_pct)),
    avg_commission: Math.max(0, finite(raw.avg_commission)),
    program_fee: Math.max(0, finite(raw.program_fee)),
  };
  const vol = resolveVolume(base);
  return { ...base, leads: vol.leads, cpl: vol.cpl };
}

export function createDefaultState(): CompareState {
  const waizBase = { ...DEFAULT_COMPARE_STATE.waiz };
  // Same-budget story: spend still tracks Current by default.
  if (DEFAULT_COMPARE_STATE.link_spend) {
    waizBase.ad_spend = DEFAULT_COMPARE_STATE.current.ad_spend;
  }
  // Waiz keeps its own avg_commission seed — never forced to Current.
  return {
    current: normalizeSide(DEFAULT_COMPARE_STATE.current),
    waiz: normalizeSide(waizBase),
    link_spend: DEFAULT_COMPARE_STATE.link_spend,
    link_commission: false,
    include_fees: DEFAULT_COMPARE_STATE.include_fees,
  };
}

export function setLinkSpend(state: CompareState, on: boolean): CompareState {
  if (!on) return { ...state, link_spend: false };
  const waiz = normalizeSide({
    ...state.waiz,
    ad_spend: state.current.ad_spend,
  });
  return { ...state, link_spend: true, waiz };
}

/** No-op for commission link — commissions stay independent (DSCR product story). */
export function setLinkCommission(
  state: CompareState,
  _on: boolean,
): CompareState {
  return { ...state, link_commission: false };
}

export function setIncludeFees(state: CompareState, on: boolean): CompareState {
  return { ...state, include_fees: on };
}

export type SidePatch = Partial<
  Pick<
    SideInputs,
    | "ad_spend"
    | "cpl"
    | "leads"
    | "contact_rate_pct"
    | "close_rate_pct"
    | "avg_commission"
    | "program_fee"
  >
>;

export function patchSide(
  state: CompareState,
  key: SideKey,
  patch: SidePatch,
): CompareState {
  const prev = state[key];
  let next: SideInputs = { ...prev };

  if (patch.cpl !== undefined) {
    next.cpl = Math.max(0, finite(patch.cpl));
    next.driver = "cpl";
  }
  if (patch.leads !== undefined) {
    next.leads = Math.max(0, finite(patch.leads));
    next.driver = "leads";
  }
  if (patch.ad_spend !== undefined) {
    next.ad_spend = Math.max(0, finite(patch.ad_spend));
  }
  if (patch.contact_rate_pct !== undefined) {
    next.contact_rate_pct = clampPct(finite(patch.contact_rate_pct));
  }
  if (patch.close_rate_pct !== undefined) {
    next.close_rate_pct = clampPct(finite(patch.close_rate_pct));
  }
  if (patch.avg_commission !== undefined) {
    next.avg_commission = Math.max(0, finite(patch.avg_commission));
  }
  if (patch.program_fee !== undefined) {
    next.program_fee = Math.max(0, finite(patch.program_fee));
  }

  next = normalizeSide(next);
  let out: CompareState = { ...state, [key]: next };

  if (key === "current" && out.link_spend && patch.ad_spend !== undefined) {
    out = {
      ...out,
      waiz: normalizeSide({ ...out.waiz, ad_spend: out.current.ad_spend }),
    };
  }
  // Intentionally do NOT sync avg_commission Current → Waiz.

  return out;
}

/** URL-safe-ish base64 JSON. Keep payload small. */
export function encodeCompareState(state: CompareState): string {
  const payload = {
    v: 1 as const,
    c: state.current,
    w: state.waiz,
    ls: state.link_spend,
    // Always write false so old clients don't re-lock Waiz commission.
    lc: false,
    f: state.include_fees,
  };
  if (typeof btoa === "function") {
    return btoa(JSON.stringify(payload));
  }
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodeCompareState(encoded: string): CompareState | null {
  try {
    const json =
      typeof atob === "function"
        ? atob(encoded)
        : Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as {
      v?: number;
      c?: SideInputs;
      w?: SideInputs;
      ls?: boolean;
      lc?: boolean;
      f?: boolean;
    };
    if (!parsed?.c || !parsed?.w) return null;
    return {
      current: normalizeSide(parsed.c),
      waiz: normalizeSide(parsed.w),
      link_spend: parsed.ls !== false,
      // Never re-lock Waiz avg commission from shared URLs.
      link_commission: false,
      include_fees: !!parsed.f,
    };
  } catch {
    return null;
  }
}

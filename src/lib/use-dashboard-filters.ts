"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getDateRange,
  PRESET_LABELS,
  ymdLocal,
  type DatePreset,
} from "@/lib/date-presets";
import { describeClientTenure, type ClientTenureInput } from "@/lib/client-tenure";
import type { ReportingType } from "@/lib/kpi-layouts";

/** Sentinel client id meaning "every client currently marked live". */
export const LIVE_SCOPE = "__live__";

export type DashboardClient = ClientTenureInput & {
  id: string;
  name: string;
  is_live?: boolean;
  reporting_type?: ReportingType;
  states_licensed?: string[] | null;
};

/** A real client is selected — not All Clients ("") and not the Live sentinel. */
export function isSingleClientId(id: string): boolean {
  return Boolean(id) && id !== LIVE_SCOPE;
}

const DEFAULT_PRESET: DatePreset = "this_month";
const STORAGE_KEY = "mw.dashboard.filters.v1";

/** Filter params owned by this hook. Everything else in the URL is left alone. */
const PARAM_KEYS = ["client", "range", "from", "to", "offer", "cmp"] as const;

const VALID_PRESETS = new Set<string>(Object.keys(PRESET_LABELS));

function parsePreset(raw: string | null | undefined): DatePreset | null {
  return raw && VALID_PRESETS.has(raw) ? (raw as DatePreset) : null;
}

function parseYmd(raw: string | null | undefined): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

type FilterState = {
  clientId: string;
  offerScope: string;
  preset: DatePreset;
  customStart: string;
  customEnd: string;
  compare: boolean;
};

const DEFAULT_STATE: FilterState = {
  clientId: "",
  offerScope: "",
  preset: DEFAULT_PRESET,
  customStart: "",
  customEnd: "",
  compare: false,
};

function readStored(): Partial<FilterState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preset = parsePreset(typeof parsed.preset === "string" ? parsed.preset : null);
    return {
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : undefined,
      offerScope: typeof parsed.offerScope === "string" ? parsed.offerScope : undefined,
      preset: preset ?? undefined,
      customStart: parseYmd(typeof parsed.customStart === "string" ? parsed.customStart : null) || undefined,
      customEnd: parseYmd(typeof parsed.customEnd === "string" ? parsed.customEnd : null) || undefined,
    };
  } catch {
    return {};
  }
}

function writeStored(state: FilterState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        clientId: state.clientId,
        offerScope: state.offerScope,
        preset: state.preset,
        customStart: state.customStart,
        customEnd: state.customEnd,
      }),
    );
  } catch {
    // Private browsing or a full quota — filters simply won't persist.
  }
}

/**
 * Resolve the initial filter state.
 *
 * A URL carrying any filter param wins outright, so a shared link is
 * deterministic even when it means "All Clients". Only a URL with no filter
 * params at all falls back to the last-used selection from localStorage.
 */
function resolveInitialState(params: URLSearchParams): FilterState {
  const hasUrlFilters = PARAM_KEYS.some(key => params.has(key));
  const base = hasUrlFilters ? {} : readStored();

  if (!hasUrlFilters) {
    return { ...DEFAULT_STATE, ...base };
  }

  return {
    clientId: params.get("client") ?? "",
    offerScope: params.get("offer") ?? "",
    preset: parsePreset(params.get("range")) ?? DEFAULT_PRESET,
    customStart: parseYmd(params.get("from")),
    customEnd: parseYmd(params.get("to")),
    compare: params.get("cmp") === "1",
  };
}

export type DashboardFilters = {
  /** "" = all clients, LIVE_SCOPE = live only, otherwise a client id. */
  clientId: string;
  offerScope: string;
  preset: DatePreset;
  customStart: string;
  customEnd: string;
  compare: boolean;

  /** Resolved range. `custom` uses the raw inputs; everything else is derived. */
  dateStart: string;
  dateEnd: string;
  /** Human label for the active range, e.g. "Last 30 Days" or "2026-01-01 – 2026-01-31". */
  dateRangeLabel: string;
  /**
   * Same range in the shape heat maps take, where absent means all-time. Covers
   * both `all_time` and a half-filled custom range.
   */
  heatmapStart: string | undefined;
  heatmapEnd: string | undefined;

  /** The selected client record, only when a single real client is scoped. */
  selectedClient: DashboardClient | null;
  selectedLaunchDate: string | null;
  sinceLaunchAvailable: boolean;
  todayYmd: string;

  /** Convenience forms for the two API scoping conventions. */
  liveOnly: boolean;
  singleClientId: string | undefined;

  setClientId: (id: string) => void;
  setOfferScope: (offer: string) => void;
  setPreset: (preset: DatePreset) => void;
  setCustomStart: (ymd: string) => void;
  setCustomEnd: (ymd: string) => void;
  toggleCompare: () => void;

  /** Apply a whole scope at once — used by cross-view links. */
  applyScope: (next: { clientId?: string; preset?: DatePreset }) => void;
};

/**
 * Owns the client + date scope shared by every client-facing view.
 *
 * State is local (so controls respond instantly) and mirrored one-way into the
 * URL by a single effect, which keeps multiple setters firing in one tick from
 * clobbering each other. Inbound URL filters are adopted on mount only, so
 * later tab navigation can never reset the scope you just chose.
 */
export function useDashboardFilters(clients: DashboardClient[]): DashboardFilters {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<FilterState>(() =>
    resolveInitialState(new URLSearchParams(searchParams.toString())),
  );
  const [renderDate] = useState(() => new Date());
  const todayYmd = useMemo(() => ymdLocal(renderDate), [renderDate]);

  const selectedClient = useMemo(
    () =>
      isSingleClientId(state.clientId)
        ? clients.find(c => c.id === state.clientId) ?? null
        : null,
    [clients, state.clientId],
  );
  const selectedLaunchDate = selectedClient?.launch_date ?? null;
  const sinceLaunchAvailable = selectedClient
    ? describeClientTenure(selectedClient, todayYmd).sinceLaunchAvailable
    : false;

  // `since_launch` only means something for one client with a launch date, so it
  // falls back whenever the scope widens or a link outlives the data. Derived
  // rather than corrected in state, so the stored intent survives — reselecting
  // a launched client restores Since Launch instead of silently staying monthly.
  // Guarded on a loaded roster, since resolving before it arrives would read as
  // "no launch date" for every client.
  const preset: DatePreset =
    state.preset === "since_launch" && clients.length > 0 && !sinceLaunchAvailable
      ? DEFAULT_PRESET
      : state.preset;

  // Single writer: state -> URL. Guarded on an actual diff so it settles.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const before = params.toString();

    if (state.clientId) params.set("client", state.clientId);
    else params.delete("client");
    if (state.offerScope) params.set("offer", state.offerScope);
    else params.delete("offer");
    // Always pinned so a copied link never falls back to the reader's own
    // stored range.
    params.set("range", preset);
    if (preset === "custom" && state.customStart) params.set("from", state.customStart);
    else params.delete("from");
    if (preset === "custom" && state.customEnd) params.set("to", state.customEnd);
    else params.delete("to");
    if (state.compare) params.set("cmp", "1");
    else params.delete("cmp");

    const after = params.toString();
    if (after === before) return;
    router.replace(after ? `${pathname}?${after}` : pathname, { scroll: false });
  }, [state, preset, searchParams, pathname, router]);

  useEffect(() => {
    writeStored(state);
  }, [state]);

  const setClientId = useCallback((id: string) => {
    setState(prev => {
      if (prev.clientId === id) return prev;
      return { ...prev, clientId: id };
    });
  }, []);

  const setOfferScope = useCallback((offer: string) => {
    setState(prev => ({ ...prev, offerScope: offer }));
  }, []);

  const setPreset = useCallback((preset: DatePreset) => {
    setState(prev => ({
      ...prev,
      preset,
      // Unbounded ranges have no equal-length predecessor to compare against.
      compare: preset === "all_time" || preset === "since_launch" ? false : prev.compare,
      // Seed the custom inputs from the range being left behind so the pickers
      // never open empty.
      ...(preset === "custom" && !(prev.customStart && prev.customEnd)
        ? seedCustom(prev)
        : null),
    }));
  }, []);

  const setCustomStart = useCallback((ymd: string) => {
    setState(prev => ({ ...prev, customStart: ymd }));
  }, []);

  const setCustomEnd = useCallback((ymd: string) => {
    setState(prev => ({ ...prev, customEnd: ymd }));
  }, []);

  const toggleCompare = useCallback(() => {
    setState(prev => ({ ...prev, compare: !prev.compare }));
  }, []);

  const applyScope = useCallback((next: { clientId?: string; preset?: DatePreset }) => {
    setState(prev => ({
      ...prev,
      ...(next.clientId !== undefined ? { clientId: next.clientId } : null),
      ...(next.preset !== undefined ? { preset: next.preset } : null),
    }));
  }, []);

  const { dateStart, dateEnd } = useMemo(() => {
    if (preset === "custom") {
      return { dateStart: state.customStart, dateEnd: state.customEnd };
    }
    const { start, end } = getDateRange(preset, selectedLaunchDate);
    return { dateStart: start, dateEnd: end };
  }, [preset, state.customStart, state.customEnd, selectedLaunchDate]);

  const dateRangeLabel =
    preset === "custom" && state.customStart && state.customEnd
      ? `${state.customStart} – ${state.customEnd}`
      : PRESET_LABELS[preset];

  const bounded = preset !== "all_time" && Boolean(dateStart && dateEnd);

  return {
    clientId: state.clientId,
    offerScope: state.offerScope,
    preset,
    customStart: state.customStart,
    customEnd: state.customEnd,
    compare: state.compare,
    dateStart,
    dateEnd,
    dateRangeLabel,
    heatmapStart: bounded ? dateStart : undefined,
    heatmapEnd: bounded ? dateEnd : undefined,
    selectedClient,
    selectedLaunchDate,
    sinceLaunchAvailable,
    todayYmd,
    liveOnly: state.clientId === LIVE_SCOPE,
    singleClientId: isSingleClientId(state.clientId) ? state.clientId : undefined,
    setClientId,
    setOfferScope,
    setPreset,
    setCustomStart,
    setCustomEnd,
    toggleCompare,
    applyScope,
  };
}

/** Carry the outgoing resolved range into the custom inputs. */
function seedCustom(prev: FilterState): Pick<FilterState, "customStart" | "customEnd"> {
  const { start, end } = getDateRange(prev.preset === "custom" ? DEFAULT_PRESET : prev.preset);
  return {
    customStart: prev.customStart || start,
    customEnd: prev.customEnd || end,
  };
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdFormats } from "../AdFormatPicker";
import AdWorkspaceOverlay, { type AdWorkspaceDrilldown } from "../AdWorkspaceOverlay";
import {
  LENSES,
  PRODUCT_COLORS,
  PRODUCT_LABELS,
  applyLens,
  type AdProductKey,
  type CreativeIntelResponse,
  type CreativeIntelRow,
  type LensId,
} from "@/lib/ad-creative-lenses";
import ClusterPanel from "./ClusterPanel";
import FatigueQuadrant from "./FatigueQuadrant";
import LensRail from "./LensRail";
import LensResults from "./LensResults";
import LifecycleTimeline from "./LifecycleTimeline";
import PortfolioPanel from "./PortfolioPanel";
import { Kicker, Stat, money, money2 } from "./ui";

type Props = {
  startDate: string;
  endDate: string;
  clientId?: string;
  onAddToLibrary: (adName: string) => void;
  onViewInLibrary: (libraryId: string) => void;
};

type ProductFilter = AdProductKey | "all";

/** Tagged with the request that produced it, so staleness is derivable. */
type Result = { key: string; data?: CreativeIntelResponse; error?: string };

function shortDate(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function CreativeCommand({
  startDate,
  endDate,
  clientId,
  onAddToLibrary,
  onViewInLibrary,
}: Props) {
  const [result, setResult] = useState<Result | null>(null);
  const [product, setProduct] = useState<ProductFilter>("all");
  const [lensId, setLensId] = useState<LensId>("working");
  const [opened, setOpened] = useState<CreativeIntelRow | null>(null);
  const [drill, setDrill] = useState<Record<string, AdWorkspaceDrilldown | "loading">>({});
  const { labels: formatLabels } = useAdFormats();
  const requestKey = `${startDate}|${endDate}|${clientId ?? ""}`;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (clientId) params.set("client_id", clientId);
    fetch(`/api/media-buyer/overview?${params}`, { signal: controller.signal })
      .then(async (r) => {
        const text = await r.text();
        if (controller.signal.aborted) return null;
        let json: CreativeIntelResponse & { error?: string } | null = null;
        if (text) {
          try {
            json = JSON.parse(text) as CreativeIntelResponse & { error?: string };
          } catch {
            throw new Error(
              `Creative Command got a bad response (${r.status || "empty"}). Try a shorter date range.`,
            );
          }
        }
        if (!r.ok) {
          throw new Error(json?.error ?? `Failed to load creative intel (${r.status})`);
        }
        if (!json) {
          throw new Error(
            `Creative Command got an empty response (${r.status || "network"}). Try a shorter date range.`,
          );
        }
        return json as CreativeIntelResponse;
      })
      .then((json) => {
        if (!json || controller.signal.aborted) return;
        setResult({ key: requestKey, data: json });
        setDrill({});
        setOpened(null);
      })
      .catch((e: Error) => {
        if (controller.signal.aborted || e.name === "AbortError") return;
        setResult({ key: requestKey, error: e.message });
      });
    return () => controller.abort();
  }, [requestKey, startDate, endDate, clientId]);

  // Derived rather than stored, so the previous window stays on screen while the
  // next one loads instead of the panel blanking on every date change.
  const loading = result?.key !== requestKey;
  const data = result?.data ?? null;
  const error = result?.key === requestKey ? (result.error ?? null) : null;

  const scoped = useMemo(() => {
    if (!data) return [];
    return product === "all" ? data.ads : data.ads.filter((a) => a.product === product);
  }, [data, product]);

  const scopedProducts = useMemo(() => {
    if (!data) return [];
    return product === "all" ? data.products : data.products.filter((p) => p.product === product);
  }, [data, product]);

  const scopedClusters = useMemo(() => {
    if (!data) return [];
    return product === "all" ? data.clusters : data.clusters.filter((c) => c.product === product);
  }, [data, product]);

  const counts = useMemo(() => {
    const out = {} as Record<LensId, number>;
    for (const lens of LENSES) out[lens.id] = applyLens(lens.id, scoped).length;
    return out;
  }, [scoped]);

  const lens = LENSES.find((l) => l.id === lensId) ?? LENSES[0];
  const lensRows = useMemo(() => applyLens(lensId, scoped), [lensId, scoped]);

  const openAd = useCallback(
    (ad: CreativeIntelRow) => {
      setOpened(ad);
      if (drill[ad.row_key]) return;
      setDrill((d) => ({ ...d, [ad.row_key]: "loading" }));
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (clientId) params.set("client_id", clientId);
      if (ad.library?.id) params.set("library_id", ad.library.id);
      else {
        params.set("ad", ad.variant_names[0] ?? ad.ad_name);
        params.set(
          "variants",
          (ad.variant_names.length ? ad.variant_names : [ad.ad_name]).join("\n"),
        );
      }
      fetch(`/api/media-buyer?${params}`)
        .then((r) => r.json())
        .then((json: AdWorkspaceDrilldown) => setDrill((d) => ({ ...d, [ad.row_key]: json })))
        .catch(() =>
          setDrill((d) => ({
            ...d,
            [ad.row_key]: {
              ad_name: ad.ad_name,
              granularity: "day",
              perClient: [],
              daily: [],
              perClientDaily: [],
            },
          })),
        );
    },
    [drill, startDate, endDate, clientId],
  );

  const totals = useMemo(() => {
    const spend = scoped.reduce((s, a) => s + a.spend, 0);
    const conversations = scoped.reduce((s, a) => s + a.unique_conversations, 0);
    return {
      spend,
      conversations,
      cpconv: conversations > 0 ? spend / conversations : null,
      signal: scoped.filter((a) => a.signal).length,
      atRisk: scoped
        .filter((a) => a.diagnosis === "creative_fatigue" || a.diagnosis === "zombie")
        .reduce((s, a) => s + a.spend, 0),
    };
  }, [scoped]);

  if (loading && !data) {
    return (
      <p className="text-sm py-10 text-center" style={{ color: "var(--color-ws-text-faint)" }}>
        Reading creative performance…
      </p>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.3)",
          color: "var(--color-ws-negative)",
        }}
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const win = data.window;
  const availableProducts = data.products.map((p) => p.product);

  return (
    <div className="space-y-4">
      {/* Scope + headline numbers */}
      <div
        className="rounded-xl"
        style={{ background: "var(--color-ws-panel)", border: "1px solid var(--color-ws-hairline)" }}
      >
        <div
          className="flex flex-wrap items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-ws-hairline-soft)" }}
        >
          <Kicker>Product</Kicker>
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...availableProducts] as ProductFilter[]).map((key) => {
              const active = product === key;
              const color = key === "all" ? "var(--color-ws-accent-bright)" : PRODUCT_COLORS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setProduct(key)}
                  aria-pressed={active}
                  className="px-2.5 py-1 rounded-md text-[11px] transition-colors"
                  style={{
                    transitionTimingFunction: "var(--ease-ws)",
                    background: active
                      ? `color-mix(in srgb, ${color} 14%, transparent)`
                      : "rgba(255,255,255,0.03)",
                    color: active ? color : "var(--color-ws-text-faint)",
                    border: `1px solid ${active ? `color-mix(in srgb, ${color} 45%, transparent)` : "var(--color-ws-hairline)"}`,
                    fontFamily: "var(--font-data), monospace",
                  }}
                >
                  {key === "all" ? "All" : PRODUCT_LABELS[key]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 px-4 py-3">
          <Stat label="Spend" value={money(totals.spend)} hint={`${scoped.length} creatives`} />
          <Stat label="Conversations" value={totals.conversations.toLocaleString()} />
          <Stat label="Blended CPCONV" value={money2(totals.cpconv)} />
          <Stat
            label="With signal"
            value={String(totals.signal)}
            hint={`of ${scoped.length} · $500+ and 2+ convs`}
          />
          <Stat
            label="Spend at risk"
            value={money(totals.atRisk)}
            tone={totals.atRisk > 0 ? "var(--color-ws-accent-bright)" : undefined}
            hint="fatiguing or stopped"
          />
        </div>

        <div
          className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1"
          style={{ borderTop: "1px solid var(--color-ws-hairline-soft)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--color-ws-text-dim)" }}>
            {win.comparable ? (
              <>
                Comparing{" "}
                <span style={{ color: "var(--color-ws-text-muted)" }}>
                  {shortDate(win.recent_start)}–{shortDate(win.recent_end)}
                </span>{" "}
                against{" "}
                <span style={{ color: "var(--color-ws-text-muted)" }}>
                  {shortDate(win.prior_start)}–{shortDate(win.prior_end)}
                </span>{" "}
                ({win.recent_days}d each)
              </>
            ) : (
              "Range too short to compare periods — decay signals are unavailable."
            )}
          </p>
          {win.comparable && !win.clean_split ? (
            <p className="text-[10px]" style={{ color: "var(--color-ws-accent-bright)" }}>
              Under 28 days selected, so each block is only {win.recent_days} days. Widen the range
              for a firmer read.
            </p>
          ) : null}
          {data.truncated ? (
            <p className="text-[10px]" style={{ color: "var(--color-ws-negative)" }}>
              Row cap reached — totals are understated. Narrow the client or date range.
            </p>
          ) : null}
        </div>
      </div>

      <LensRail active={lensId} counts={counts} onSelect={setLensId} />

      {lens.portfolio ? (
        <PortfolioPanel products={scopedProducts} />
      ) : (
        <LensResults lens={lens} rows={lensRows} formatLabels={formatLabels} onOpen={openAd} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FatigueQuadrant ads={scoped} onOpen={openAd} />
        <LifecycleTimeline ads={scoped} window={win} onOpen={openAd} />
      </div>

      {lens.portfolio ? null : <PortfolioPanel products={scopedProducts} />}

      <ClusterPanel clusters={scopedClusters} formatLabels={formatLabels} />

      {opened ? (
        <AdWorkspaceOverlay
          ad={opened}
          drilldown={drill[opened.row_key] ?? "loading"}
          formatLabels={formatLabels}
          onClose={() => setOpened(null)}
          onViewInLibrary={(id) => {
            setOpened(null);
            onViewInLibrary(id);
          }}
          onAddToLibrary={(name) => {
            setOpened(null);
            onAddToLibrary(name);
          }}
        />
      ) : null}
    </div>
  );
}

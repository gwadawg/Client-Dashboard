"use client";

import { useMemo, useState } from "react";
import { adFormatLabel } from "@/lib/ad-formats";
import { PRODUCT_COLORS, PRODUCT_LABELS, type ClusterRow } from "@/lib/ad-creative-lenses";
import { Delta, Empty, Panel, money, money2, pct } from "./ui";

type Props = {
  clusters: ClusterRow[];
  formatLabels: Record<string, string>;
};

type ClusterView = "format" | string; // format or a tag category key

const CATEGORY_LABELS: Record<string, string> = {
  concept: "Concept",
  topic: "Topic",
  trigger: "Trigger",
  bucket: "Bucket",
  track: "Track",
  strategy: "Strategy",
  creative_job: "Creative job",
  angle: "Angle",
  outcome: "Outcome",
  stage: "Stage",
  equity_callout: "Equity callout",
};

/**
 * Concept clusters. Fatigue is usually the message rather than the format, so
 * spend soak sits next to the cluster's own CPCONV drift — a format only looks
 * tired when one message inside it ate the budget.
 */
export default function ClusterPanel({ clusters, formatLabels }: Props) {
  const categoryKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const c of clusters) {
      if (c.kind === "tag" && c.category) keys.add(c.category);
    }
    const preferred = [
      "concept",
      "topic",
      "trigger",
      "bucket",
      "track",
      "strategy",
      "creative_job",
      "angle",
      "outcome",
      "stage",
      "equity_callout",
    ];
    return [
      ...preferred.filter((k) => keys.has(k)),
      ...[...keys].filter((k) => !preferred.includes(k)).sort(),
    ];
  }, [clusters]);

  const [view, setView] = useState<ClusterView>("format");
  const effectiveView =
    view === "format" || categoryKeys.includes(view)
      ? view
      : categoryKeys[0] ?? "format";

  const rows =
    effectiveView === "format"
      ? clusters.filter((c) => c.kind === "format")
      : clusters.filter((c) => c.kind === "tag" && c.category === effectiveView);
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  const tabs: { key: ClusterView; label: string }[] = [
    { key: "format", label: "Format" },
    ...categoryKeys.map((k) => ({
      key: k,
      label: CATEGORY_LABELS[k] ?? k,
    })),
  ];

  return (
    <Panel
      title="Concept clusters"
      hint="Spend soak and CPCONV drift by category and by format, within each product."
      actions={
        <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={effectiveView === key}
              className="px-2.5 py-1 rounded-md text-[11px] transition-colors"
              style={{
                transitionTimingFunction: "var(--ease-ws)",
                background:
                  effectiveView === key
                    ? "var(--color-ws-accent-wash)"
                    : "rgba(255,255,255,0.03)",
                color:
                  effectiveView === key
                    ? "var(--color-ws-accent-bright)"
                    : "var(--color-ws-text-faint)",
                border: `1px solid ${
                  effectiveView === key
                    ? "color-mix(in srgb, var(--color-ws-accent) 45%, transparent)"
                    : "var(--color-ws-hairline)"
                }`,
                fontFamily: "var(--font-data), monospace",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty>
          {effectiveView === "format"
            ? "No format clusters in range."
            : "No tag clusters in range. Re-label creatives in Ad Library (Needs tags)."}
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  "Cluster",
                  "Product",
                  "Ads",
                  "Spend",
                  "Soak",
                  "CPCONV",
                  "Drift",
                  "Med CTR",
                  "Med opt-in",
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`px-2 py-2 text-[9px] uppercase tracking-[0.14em] font-normal ${i < 2 ? "text-left" : "text-right"}`}
                    style={{
                      color: "var(--color-ws-text-faint)",
                      fontFamily: "var(--font-display), sans-serif",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={`${c.kind}-${c.category ?? "fmt"}-${c.product}-${c.key}`}
                  style={{ borderTop: "1px solid var(--color-ws-hairline-soft)" }}
                >
                  <td className="px-2 py-2" style={{ color: "var(--color-ws-text-loud)" }}>
                    {c.kind === "format" ? adFormatLabel(c.key, formatLabels) : c.label}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className="text-[10px]"
                      style={{
                        color: PRODUCT_COLORS[c.product],
                        fontFamily: "var(--font-data), monospace",
                      }}
                    >
                      {PRODUCT_LABELS[c.product]}
                    </span>
                  </td>
                  <Num>{c.ad_count}</Num>
                  <Num>{money(c.spend)}</Num>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div
                        className="h-1.5 rounded-full flex-shrink-0"
                        style={{
                          width: `${Math.max((c.spend / maxSpend) * 48, 2)}px`,
                          background: PRODUCT_COLORS[c.product],
                          opacity: 0.7,
                        }}
                      />
                      <span
                        className="tabular-nums text-xs"
                        style={{
                          color: "var(--color-ws-text-muted)",
                          fontFamily: "var(--font-data), monospace",
                        }}
                      >
                        {pct(c.spend_share)}
                      </span>
                    </div>
                  </td>
                  <Num>{money2(c.cp_conversation)}</Num>
                  <td
                    className="px-2 py-2 text-right text-xs"
                    style={{ fontFamily: "var(--font-data), monospace" }}
                  >
                    <Delta value={c.cpconv_delta_pct} goodWhen="down" />
                  </td>
                  <Num>{pct(c.median_ctr, 2)}</Num>
                  <Num>{pct(c.median_optin)}</Num>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="px-2 py-2 text-right tabular-nums text-xs"
      style={{ color: "var(--color-ws-text)", fontFamily: "var(--font-data), monospace" }}
    >
      {children}
    </td>
  );
}

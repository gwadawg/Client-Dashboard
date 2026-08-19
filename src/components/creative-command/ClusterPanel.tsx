"use client";

import { useState } from "react";
import { adFormatLabel } from "@/lib/ad-formats";
import { PRODUCT_COLORS, PRODUCT_LABELS, type ClusterRow } from "@/lib/ad-creative-lenses";
import { Delta, Empty, Panel, money, money2, pct } from "./ui";

type Props = {
  clusters: ClusterRow[];
  formatLabels: Record<string, string>;
};

/**
 * Concept clusters. Fatigue is usually the message rather than the format, so
 * spend soak sits next to the cluster's own CPCONV drift — a format only looks
 * tired when one message inside it ate the budget.
 */
export default function ClusterPanel({ clusters, formatLabels }: Props) {
  const [kind, setKind] = useState<"tag" | "format">("tag");
  const rows = clusters.filter((c) => c.kind === kind);
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  return (
    <Panel
      title="Concept clusters"
      hint="Spend soak and CPCONV drift by message and by format, within each product."
      actions={
        <div className="flex gap-1 flex-shrink-0">
          {(
            [
              ["tag", "Topic"],
              ["format", "Format"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setKind(key)}
              aria-pressed={kind === key}
              className="px-2.5 py-1 rounded-md text-[11px] transition-colors"
              style={{
                transitionTimingFunction: "var(--ease-ws)",
                background: kind === key ? "var(--color-ws-accent-wash)" : "rgba(255,255,255,0.03)",
                color: kind === key ? "var(--color-ws-accent-bright)" : "var(--color-ws-text-faint)",
                border: `1px solid ${kind === key ? "color-mix(in srgb, var(--color-ws-accent) 45%, transparent)" : "var(--color-ws-hairline)"}`,
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
          No {kind === "tag" ? "topic" : "format"} clusters in range. Tag creatives in Ad Library to
          build them.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Cluster", "Product", "Ads", "Spend", "Soak", "CPCONV", "Drift", "Med CTR", "Med opt-in"].map(
                  (h, i) => (
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
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={`${c.kind}-${c.product}-${c.key}`}
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

"use client";

import { PRODUCT_COLORS, type ProductRollup } from "@/lib/ad-creative-lenses";
import { Empty, Kicker, Panel, money, money2, pct } from "./ui";

/**
 * Portfolio risk. A per-ad view can never show that most of a product's budget
 * rides three creatives — which is the number that decides how urgent a
 * fatiguing winner actually is.
 */
export default function PortfolioPanel({ products }: { products: ProductRollup[] }) {
  if (!products.length) {
    return (
      <Panel title="Spend concentration">
        <Empty>No spend in this window.</Empty>
      </Panel>
    );
  }

  const maxSpend = Math.max(...products.map((p) => p.spend), 1);

  return (
    <Panel
      title="Spend concentration"
      hint="Share of each product budget on its three largest creatives, and how much of that budget is already fatiguing or stopped."
    >
      <div className="space-y-4">
        {products.map((p) => {
          const color = PRODUCT_COLORS[p.product];
          const top3 = p.top3_spend_share ?? 0;
          const atRisk = p.spend > 0 ? ((p.fatiguing_spend + p.zombie_spend) / p.spend) * 100 : 0;
          return (
            <div key={p.product}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span
                    className="text-sm"
                    style={{ color, fontFamily: "var(--font-display), sans-serif" }}
                  >
                    {p.label}
                  </span>
                  <span
                    className="text-[10px] tabular-nums"
                    style={{ color: "var(--color-ws-text-faint)", fontFamily: "var(--font-data), monospace" }}
                  >
                    {p.ad_count} ads · {p.signal_ad_count} with signal
                  </span>
                </div>
                <span
                  className="text-sm tabular-nums flex-shrink-0"
                  style={{ color: "var(--color-ws-text-loud)", fontFamily: "var(--font-data), monospace" }}
                >
                  {money(p.spend)}
                </span>
              </div>

              {/* Outer width encodes the product's share of total spend; the inner
                  fill encodes how much of it sits on the top three creatives. */}
              <div
                className="h-2.5 rounded-full overflow-hidden"
                style={{
                  width: `${Math.max((p.spend / maxSpend) * 100, 6)}%`,
                  background: "rgba(255,255,255,0.05)",
                }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${top3}%`,
                    background: color,
                    transition: "width 320ms var(--ease-ws)",
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5">
                <Metric label="Top 3 share" value={pct(p.top3_spend_share)} tone={top3 >= 70 ? "var(--color-ws-accent-bright)" : undefined} />
                <Metric label="CPCONV" value={money2(p.cp_conversation)} />
                <Metric label="Median CPCONV" value={money2(p.median_cpconv)} />
                <Metric
                  label="Fatiguing"
                  value={money(p.fatiguing_spend)}
                  tone={p.fatiguing_spend > 0 ? "var(--color-ws-accent-bright)" : undefined}
                />
                <Metric
                  label="Stopped"
                  value={money(p.zombie_spend)}
                  tone={p.zombie_spend > 0 ? "var(--color-ws-text-dim)" : undefined}
                />
                <Metric
                  label="At risk"
                  value={pct(atRisk)}
                  tone={atRisk >= 25 ? "var(--color-ws-negative)" : undefined}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <Kicker>{label}</Kicker>
      <p
        className="text-xs tabular-nums"
        style={{ color: tone ?? "var(--color-ws-text)", fontFamily: "var(--font-data), monospace" }}
      >
        {value}
      </p>
    </div>
  );
}

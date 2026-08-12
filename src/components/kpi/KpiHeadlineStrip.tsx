import MetricInfoTip from "./MetricInfoTip";
import Sparkline from "./Sparkline";
import type { KpiDelta } from "./KpiCard";

export type HeadlineMetric = {
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
  hint?: string;
  delta?: KpiDelta;
  spark?: (number | null)[];
  refLine?: string;
};

type Props = {
  metrics: HeadlineMetric[];
};

/**
 * The handful of numbers you actually open a client to check, pulled above the
 * 20-odd cards in the sections below. Bigger figures and a heavier surround, so
 * the eye lands here first instead of scanning a uniform grid for the signal.
 */
export default function KpiHeadlineStrip({ metrics }: Props) {
  if (!metrics.length) return null;

  return (
    <section
      className="rounded-2xl p-4 md:p-5"
      style={{
        background: "linear-gradient(135deg, #132a52 0%, #0c1a30 55%, #0a1628 100%)",
        border: "1px solid rgba(245,158,11,0.18)",
        boxShadow: "0 4px 24px rgba(8,15,30,0.5)",
      }}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {metrics.map(metric => (
          <div
            key={metric.label}
            className="relative flex flex-col rounded-lg px-3 pt-2.5 pb-2"
            style={{
              background: "rgba(8,15,30,0.55)",
              border: "1px solid var(--color-ws-hairline)",
              borderTop: `2px solid ${metric.accent ? "var(--color-ws-accent)" : "rgba(59,130,246,0.55)"}`,
            }}
          >
            {metric.hint && (
              <span className="absolute top-1.5 right-1.5 z-10">
                <MetricInfoTip hint={metric.hint} />
              </span>
            )}
            <span
              className="font-display text-[10px] font-semibold uppercase leading-snug tracking-[0.12em] pr-5"
              style={{ color: "var(--color-ws-text-muted)" }}
            >
              {metric.label}
            </span>
            <span
              className="font-data mt-1 text-[1.35rem] leading-none font-bold tabular-nums tracking-tight"
              style={{
                color: metric.accent ? "var(--color-ws-accent-bright)" : "var(--color-ws-text-loud)",
              }}
            >
              {metric.value}
            </span>
            {(metric.caption || metric.delta) && (
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {metric.caption && (
                  <span
                    className="text-[9px] font-medium uppercase tracking-wide"
                    style={{ color: "var(--color-ws-text-faint)" }}
                  >
                    {metric.caption}
                  </span>
                )}
                {metric.delta && (
                  <span
                    className="font-data text-[10px] font-semibold tabular-nums"
                    style={{ color: deltaColor(metric.delta.good) }}
                  >
                    {metric.delta.good == null ? "–" : metric.delta.good ? "▲" : "▼"}{" "}
                    {metric.delta.text}
                  </span>
                )}
              </div>
            )}
            {metric.spark && (
              <div className="mt-auto pt-2" style={{ height: 22 }}>
                <Sparkline
                  data={metric.spark}
                  color={metric.accent ? "#f59e0b" : "#3b82f6"}
                  width={160}
                  height={22}
                  className="h-full w-full"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function deltaColor(good: boolean | null): string {
  if (good == null) return "var(--color-ws-text-dim)";
  return good ? "var(--color-ws-positive)" : "var(--color-ws-negative)";
}

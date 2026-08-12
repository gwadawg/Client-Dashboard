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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map(metric => (
          <div
            key={metric.label}
            className="relative rounded-xl px-3.5 py-3 flex flex-col gap-1"
            style={{
              background: "rgba(8,15,30,0.55)",
              border: "1px solid var(--color-ws-hairline)",
            }}
          >
            {metric.hint && (
              <span className="absolute top-2 right-2 z-10">
                <MetricInfoTip hint={metric.hint} />
              </span>
            )}
            <span
              className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] pr-5"
              style={{ color: "var(--color-ws-text-dim)" }}
            >
              {metric.label}
            </span>
            <span
              className="font-data text-2xl md:text-[1.75rem] leading-none font-bold tabular-nums tracking-tight"
              style={{
                color: metric.accent ? "var(--color-ws-accent-bright)" : "var(--color-ws-text-loud)",
              }}
            >
              {metric.value}
            </span>
            {metric.caption && (
              <span
                className="text-[10px] font-medium uppercase tracking-wide"
                style={{ color: "var(--color-ws-text-faint)" }}
              >
                {metric.caption}
              </span>
            )}
            {metric.delta && (
              <span
                className="text-[11px] font-semibold flex items-center gap-1"
                style={{ color: deltaColor(metric.delta.good) }}
              >
                {metric.delta.good == null ? "–" : metric.delta.good ? "▲" : "▼"} {metric.delta.text}
              </span>
            )}
            {metric.spark && (
              <div className="mt-0.5 h-6 w-full">
                <Sparkline
                  data={metric.spark}
                  color={metric.accent ? "#f59e0b" : "#3b82f6"}
                  width={140}
                  height={24}
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

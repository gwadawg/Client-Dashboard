import Sparkline from "./Sparkline";
import MetricInfoTip, { type MetricHint } from "./MetricInfoTip";

const AMBER_BADGE = "#fbbf24";

export type KpiDelta = {
  /** Pre-formatted change text, e.g. "+12%" or "+3.4 pts". */
  text: string;
  /** true = good direction (green), false = bad (red), null = no change/neutral. */
  good: boolean | null;
};

type Props = {
  label: string;
  value: string;
  accent?: boolean;
  /** Scope chip — e.g. LIVE, PERIOD, T3 — shown under the label. */
  badge?: string;
  hint?: MetricHint | string;
  delta?: KpiDelta;
  spark?: (number | null)[];
  /** Fine line under the value (e.g. "unique / total"). */
  caption?: string;
  /** Quieter companion line, e.g. "Booking (ref) 40.63%". */
  refLine?: string;
};

/**
 * Dense metric tile. The label has to win a scan — these get stared at while
 * auditing a client, so empty padding and a whisper-gray label are the enemy.
 */
export default function KpiCard({
  label,
  value,
  accent = false,
  badge,
  hint,
  delta,
  spark,
  caption,
  refLine,
}: Props) {
  return (
    <div
      className="group relative flex h-full flex-col rounded-lg px-3 pt-2.5 pb-2 transition-[border-color,background] duration-200 ease-ws"
      style={{
        background: "var(--color-ws-input)",
        border: "1px solid var(--color-ws-hairline)",
        borderTop: `2px solid ${accent ? "var(--color-ws-accent)" : "rgba(59,130,246,0.55)"}`,
      }}
    >
      {hint && (
        <span className="absolute top-1.5 right-1.5 z-10 opacity-70 transition-opacity group-hover:opacity-100">
          <MetricInfoTip hint={hint} />
        </span>
      )}

      <div className="flex items-start gap-1.5 pr-5">
        <p
          className="font-display text-[10px] font-semibold uppercase leading-snug tracking-[0.12em]"
          style={{ color: "var(--color-ws-text-muted)" }}
          title={label}
        >
          {label}
        </p>
        {badge && (
          <span
            className="mt-px shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider"
            style={{
              background: badge === "LIVE" ? "rgba(59,130,246,0.18)" : "rgba(245,158,11,0.14)",
              color: badge === "LIVE" ? "#93c5fd" : AMBER_BADGE,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      <p
        className="font-data mt-1 text-[1.35rem] font-bold leading-none tabular-nums tracking-tight"
        style={{ color: accent ? "var(--color-ws-accent-bright)" : "var(--color-ws-text-loud)" }}
      >
        {value}
      </p>

      {(caption || delta || refLine) && (
        <div className="mt-1 flex flex-col gap-0.5">
          {(caption || delta) && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {caption && (
                <span
                  className="text-[9px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--color-ws-text-faint)" }}
                >
                  {caption}
                </span>
              )}
              {delta && (
                <span
                  className="font-data text-[10px] font-semibold tabular-nums"
                  style={{ color: deltaColor(delta.good) }}
                >
                  {delta.good == null ? "–" : delta.good ? "▲" : "▼"} {delta.text}
                </span>
              )}
            </div>
          )}
          {refLine && (
            <span
              className="font-data text-[10px] tabular-nums"
              style={{ color: "var(--color-ws-text-dim)" }}
            >
              {refLine}
            </span>
          )}
        </div>
      )}

      {spark && (
        <div className="mt-auto pt-2" style={{ height: 22 }}>
          <Sparkline
            data={spark}
            color={accent ? "#f59e0b" : "#3b82f6"}
            width={160}
            height={22}
            className="h-full w-full"
          />
        </div>
      )}
    </div>
  );
}

function deltaColor(good: boolean | null): string {
  if (good == null) return "var(--color-ws-text-dim)";
  return good ? "var(--color-ws-positive)" : "var(--color-ws-negative)";
}

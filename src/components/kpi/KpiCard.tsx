import Sparkline, { sparkHasSignal } from "./Sparkline";
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
  /** Scope chip — e.g. LIVE, PERIOD, T3 — shown beside the label. */
  badge?: string;
  hint?: MetricHint | string;
  delta?: KpiDelta;
  spark?: (number | null)[];
  /** Fine line under the value (e.g. "unique / total"). */
  caption?: string;
  /** Quieter companion line, e.g. "Booking (ref) 40.63%". */
  refLine?: string;
  /** "hero" is the headline strip: same tile, one size step up. */
  size?: "default" | "hero";
  /** Surface override so the hero strip can sit on its own panel. */
  surface?: string;
};

/**
 * The one metric tile in the dashboard. Label reads first, then the figure with
 * its delta on the same baseline so a wide tile doesn't leave a horizontal void,
 * then the trend hugging the bottom edge as a full-bleed footer.
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
  size = "default",
  surface,
}: Props) {
  const hero = size === "hero";
  const showSpark = sparkHasSignal(spark);

  return (
    <div
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg transition-colors duration-200 ease-ws"
      style={{
        background: surface ?? "var(--color-ws-input)",
        border: "1px solid var(--color-ws-hairline)",
      }}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[2px]"
          style={{ background: "var(--color-ws-accent)" }}
        />
      )}

      <div className={`flex min-w-0 flex-1 flex-col ${hero ? "px-3.5 pt-3 pb-2.5" : "px-3 pt-2.5 pb-2"}`}>
        <div className="flex min-w-0 items-start gap-1.5">
          <p
            className="font-display min-w-0 flex-1 text-[10px] font-semibold uppercase leading-snug tracking-[0.13em]"
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
          {hint && (
            <span className="-mt-0.5 -mr-1 shrink-0 opacity-50 transition-opacity group-hover:opacity-100">
              <MetricInfoTip hint={hint} />
            </span>
          )}
        </div>

        <div className={`flex min-w-0 items-baseline gap-2 ${hero ? "mt-2" : "mt-1.5"}`}>
          <span
            className={`font-data min-w-0 truncate font-bold leading-none tabular-nums tracking-tight ${
              hero ? "text-[1.9rem]" : "text-[1.4rem]"
            }`}
            style={{ color: accent ? "var(--color-ws-accent-bright)" : "var(--color-ws-text-loud)" }}
          >
            {value}
          </span>
          {delta && (
            <span
              className="font-data ml-auto shrink-0 text-[10px] font-semibold tabular-nums"
              style={{ color: deltaColor(delta.good) }}
            >
              {delta.good == null ? "–" : delta.good ? "▲" : "▼"} {delta.text}
            </span>
          )}
        </div>

        {(caption || refLine) && (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {caption && (
              <span
                className="text-[9px] font-medium uppercase tracking-wide"
                style={{ color: "var(--color-ws-text-dim)" }}
              >
                {caption}
              </span>
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
      </div>

      {showSpark && (
        <Sparkline
          data={spark!}
          color={accent ? "#f59e0b" : "#3b82f6"}
          className={`w-full shrink-0 ${hero ? "h-7" : "h-6"}`}
        />
      )}
    </div>
  );
}

function deltaColor(good: boolean | null): string {
  if (good == null) return "var(--color-ws-text-dim)";
  return good ? "var(--color-ws-positive)" : "var(--color-ws-negative)";
}

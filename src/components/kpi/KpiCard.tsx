import Sparkline from "./Sparkline";
import MetricInfoTip, { type MetricHint } from "./MetricInfoTip";

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
  hint?: MetricHint | string;
  delta?: KpiDelta;
  spark?: (number | null)[];
};

export default function KpiCard({ label, value, accent = false, hint, delta, spark }: Props) {
  return (
    <div
      className="relative rounded-xl p-5 flex flex-col gap-2 transition-all duration-200 hover:translate-y-[-1px] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{
        background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div
        className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
        style={{ background: accent ? "#f59e0b" : "#1d4ed8" }}
        aria-hidden
      />
      {hint && (
        <span className="absolute top-3 right-3 z-10">
          <MetricInfoTip hint={hint} />
        </span>
      )}
      <span className="text-xs font-medium tracking-wide pl-3 pr-5" style={{ color: "#64748b" }}>
        {label}
      </span>
      <span className="text-3xl font-bold pl-3 tabular-nums" style={{ color: "#f1f5f9" }}>
        {value}
      </span>
      {delta && (
        <span
          className="pl-3 text-[11px] font-semibold flex items-center gap-1"
          style={{ color: deltaColor(delta.good) }}
        >
          {delta.good == null ? "–" : delta.good ? "▲" : "▼"} {delta.text}
          <span className="font-normal" style={{ color: "#475569" }}>vs prev</span>
        </span>
      )}
      {spark && (
        <div className="pl-3 mt-1 h-7 w-full">
          <Sparkline data={spark} color={accent ? "#f59e0b" : "#3b82f6"} width={140} height={28} />
        </div>
      )}
    </div>
  );
}

function deltaColor(good: boolean | null): string {
  if (good == null) return "#64748b";
  return good ? "#34d399" : "#f87171";
}

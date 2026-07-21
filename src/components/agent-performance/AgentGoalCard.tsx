"use client";

type Props = {
  rank: number;
  agentName: string;
  current: number;
  target: number | null;
  metricLabel: string;
  muted?: boolean;
};

function pctColor(pct: number | null): string {
  if (pct == null) return "#64748b";
  if (pct >= 100) return "#34d399";
  if (pct >= 70) return "#fbbf24";
  return "#f87171";
}

export default function AgentGoalCard({
  rank,
  agentName,
  current,
  target,
  metricLabel,
  muted = false,
}: Props) {
  const hasGoal = target != null && target > 0;
  const rawPct = hasGoal ? Math.round((current / target) * 100) : null;
  const barPct = rawPct == null ? 0 : Math.min(100, rawPct);
  const remaining = hasGoal ? Math.max(0, target - current) : null;
  const color = pctColor(rawPct);

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: muted
          ? "rgba(10,22,40,0.6)"
          : "linear-gradient(160deg, #0d1b2e 0%, #0a1628 100%)",
        border: muted
          ? "1px solid rgba(255,255,255,0.05)"
          : rank === 1
            ? "1px solid rgba(245,158,11,0.45)"
            : "1px solid rgba(255,255,255,0.08)",
        boxShadow: rank === 1 && !muted ? "inset 0 1px 0 rgba(245,158,11,0.15)" : undefined,
        opacity: muted ? 0.72 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className="text-[10px] font-semibold tracking-[0.12em] uppercase"
            style={{ color: rank === 1 && !muted ? "#f59e0b" : "#64748b" }}
          >
            {hasGoal ? `Rank ${String(rank).padStart(2, "0")}` : "No goal"}
          </div>
          <div className="text-[15px] font-bold mt-0.5" style={{ color: "#f8fafc" }}>
            {agentName}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "#64748b" }}>
            {metricLabel}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[26px] font-extrabold leading-none tabular-nums" style={{ color }}>
            {hasGoal ? `${rawPct}%` : "—"}
          </div>
        </div>
      </div>

      <div
        className="h-2.5 rounded overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded transition-[width] duration-500"
          style={{
            width: `${barPct}%`,
            background:
              rawPct != null && rawPct >= 100
                ? "linear-gradient(90deg,#34d399,#6ee7b7)"
                : "linear-gradient(90deg,#f59e0b,#fbbf24)",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="tabular-nums" style={{ color: "#94a3b8" }}>
          {current.toLocaleString()}
          {hasGoal ? (
            <span style={{ color: "#475569" }}> / {target.toLocaleString()} goal</span>
          ) : (
            <span style={{ color: "#475569" }}> · set a goal in Goals</span>
          )}
        </span>
        {remaining != null && remaining > 0 && (
          <span style={{ color: "#64748b" }}>{remaining.toLocaleString()} to go</span>
        )}
        {remaining === 0 && hasGoal && (
          <span style={{ color: "#34d399" }}>Goal hit</span>
        )}
      </div>
    </div>
  );
}

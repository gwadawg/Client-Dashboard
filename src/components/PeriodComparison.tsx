"use client";

import { useState } from "react";
import { KPI_META, TIER_LABEL, type ClientHealthSnapshot, type KpiKey, type RecentLeading } from "@/lib/client-health";
import { normalizeReportingType, usesCallCenterKpiLayout } from "@/lib/kpi-layouts";

type CompareTab = "verdict" | "leading";

type Props = {
  current: ClientHealthSnapshot;
  prior: ClientHealthSnapshot | null;
  recent: RecentLeading | null;
  recentPrior: RecentLeading | null;
  reportingType?: string;
  verdictLabel?: string;
  priorVerdictLabel?: string;
};

type RowDef = {
  label: string;
  current: string;
  prior: string;
  delta: string;
  improved: boolean | null;
};

function deltaNum(cur: number, prev: number, lowerIsBetter: boolean): boolean | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  if (cur === prev) return null;
  return lowerIsBetter ? cur < prev : cur > prev;
}

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function verdictRows(
  current: ClientHealthSnapshot,
  prior: ClientHealthSnapshot | null,
  isHe: boolean,
): RowDef[] {
  if (!prior) return [];
  const cm = current.metrics;
  const pm = prior.metrics;
  const rows: RowDef[] = [
    {
      label: isHe ? "Hand-raise (unique ÷ leads)" : "CPConv",
      current: isHe
        ? `${cm.lead_hand_raise_rate.toFixed(1)}%`
        : fmtMoney(current.cpconv),
      prior: isHe
        ? `${pm.lead_hand_raise_rate.toFixed(1)}%`
        : fmtMoney(prior.cpconv),
      delta: isHe
        ? `${(cm.lead_hand_raise_rate - pm.lead_hand_raise_rate).toFixed(1)} pts`
        : fmtMoney(current.cpconv - prior.cpconv),
      improved: isHe
        ? deltaNum(cm.lead_hand_raise_rate, pm.lead_hand_raise_rate, false)
        : deltaNum(current.cpconv, prior.cpconv, true),
    },
    {
      label: "Net show rate",
      current: `${cm.net_show_pct.toFixed(0)}%`,
      prior: `${pm.net_show_pct.toFixed(0)}%`,
      delta: `${(cm.net_show_pct - pm.net_show_pct).toFixed(0)} pts`,
      improved: deltaNum(cm.net_show_pct, pm.net_show_pct, false),
    },
    {
      label: "Leads",
      current: String(cm.new_leads),
      prior: String(pm.new_leads),
      delta: String(cm.new_leads - pm.new_leads),
      improved: deltaNum(cm.new_leads, pm.new_leads, false),
    },
  ];
  if (!isHe) {
    rows.splice(1, 0, {
      label: "Hand-raise rate (booked + claimed + LT)",
      current: `${cm.hand_raise_rate.toFixed(0)}%`,
      prior: `${pm.hand_raise_rate.toFixed(0)}%`,
      delta: `${(cm.hand_raise_rate - pm.hand_raise_rate).toFixed(0)} pts`,
      improved: deltaNum(cm.hand_raise_rate, pm.hand_raise_rate, false),
    });
    rows.push({
      label: "CPQL",
      current: fmtMoney(current.cpql),
      prior: fmtMoney(prior.cpql),
      delta: fmtMoney(current.cpql - prior.cpql),
      improved: deltaNum(current.cpql, prior.cpql, true),
    });
  }
  return rows;
}

function leadingRows(recent: RecentLeading, prior: RecentLeading | null, isHe: boolean): RowDef[] {
  if (!prior) return [];
  const rows: RowDef[] = [
    {
      label: isHe ? "Hand-raise (unique ÷ leads)" : "Hand-raise rate",
      current: `${recent.hand_raise_rate.toFixed(1)}%`,
      prior: `${prior.hand_raise_rate.toFixed(1)}%`,
      delta: `${(recent.hand_raise_rate - prior.hand_raise_rate).toFixed(1)} pts`,
      improved: deltaNum(recent.hand_raise_rate, prior.hand_raise_rate, false),
    },
    {
      label: "Leads",
      current: String(recent.leads),
      prior: String(prior.leads),
      delta: String(recent.leads - prior.leads),
      improved: deltaNum(recent.leads, prior.leads, false),
    },
    {
      label: "Conversations (LT+show+claimed)",
      current: String(recent.conversations),
      prior: String(prior.conversations),
      delta: String(recent.conversations - prior.conversations),
      improved: deltaNum(recent.conversations, prior.conversations, false),
    },
  ];
  if (!isHe) {
    rows.unshift({
      label: "Lead → qual %",
      current: `${recent.lead_to_qualified_pct.toFixed(0)}%`,
      prior: `${prior.lead_to_qualified_pct.toFixed(0)}%`,
      delta: `${(recent.lead_to_qualified_pct - prior.lead_to_qualified_pct).toFixed(0)} pts`,
      improved: deltaNum(recent.lead_to_qualified_pct, prior.lead_to_qualified_pct, false),
    });
    rows.push(
      {
        label: recent.cost_window_days
          ? `CPL (last ${recent.cost_window_days}d · through today)`
          : "CPL",
        current: fmtMoney(recent.cpl),
        prior: fmtMoney(prior.cpl),
        delta: fmtMoney(recent.cpl - prior.cpl),
        improved: deltaNum(recent.cpl, prior.cpl, true),
      },
      {
        label: recent.cost_window_days
          ? `CPQL (last ${recent.cost_window_days}d · through today)`
          : "CPQL",
        current: fmtMoney(recent.cpql),
        prior: fmtMoney(prior.cpql),
        delta: fmtMoney(recent.cpql - prior.cpql),
        improved: deltaNum(recent.cpql, prior.cpql, true),
      },
    );
  }
  return rows;
}

export default function PeriodComparison({
  current,
  prior,
  recent,
  recentPrior,
  reportingType,
  verdictLabel = "Current period",
  priorVerdictLabel = "Prior period",
}: Props) {
  const [tab, setTab] = useState<CompareTab>("verdict");
  const isHe = usesCallCenterKpiLayout(reportingType);

  const rows =
    tab === "verdict"
      ? verdictRows(current, prior, isHe)
      : recent && recentPrior
        ? leadingRows(recent, recentPrior, isHe)
        : [];

  return (
    <div className="rounded-xl p-5" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
          Period comparison
        </h3>
        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "#050c18" }}>
          {(
            [
              { key: "verdict" as const, label: isHe ? "Verdict window" : "Verdict window" },
              { key: "leading" as const, label: `Leading ${recent?.window_days ?? 14}d` },
            ] as const
          ).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold"
              style={
                tab === t.key
                  ? { background: "#f59e0b", color: "#fff" }
                  : { color: "#64748b" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "#475569" }}>
          {tab === "verdict" ? "No prior verdict period to compare." : "No prior leading window to compare."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="text-left py-2 pr-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
                  Metric
                </th>
                <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
                  {priorVerdictLabel}
                </th>
                <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
                  {verdictLabel}
                </th>
                <th className="text-right py-2 pl-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="py-2.5 pr-4" style={{ color: "#94a3b8" }}>
                    {r.label}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "#64748b" }}>
                    {r.prior}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-medium" style={{ color: "#e2e8f0" }}>
                    {r.current}
                  </td>
                  <td
                    className="py-2.5 pl-3 text-right tabular-nums font-semibold"
                    style={{
                      color:
                        r.improved === true ? "#34d399" : r.improved === false ? "#f87171" : "#64748b",
                    }}
                  >
                    {r.improved === true ? "↑ " : r.improved === false ? "↓ " : ""}
                    {r.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "leading" && recent?.cost_window_days ? (
        <p className="text-[10px] mt-3" style={{ color: "#334155" }}>
          Funnel metrics use the matured leading window ({recent.start} → {recent.end}). CPL and CPQL use the
          calendar-last {recent.cost_window_days} days through today ({recent.cost_start} → {recent.cost_end}) so ad-cost
          spikes surface before CPConv matures.
        </p>
      ) : null}

      {tab === "verdict" && prior && (
        <p className="text-[10px] mt-3" style={{ color: "#334155" }}>
          Graded KPIs:{" "}
          {current.grades
            .filter(g => g.tier !== "insufficient")
            .map(g => `${KPI_META[g.key as KpiKey]?.short ?? g.key} ${TIER_LABEL[g.tier]}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  KPI_META,
  TIER_LABEL,
  type ClientHealthSnapshot,
  type ConstraintGuidance,
  type FunnelLayer,
  type HealthTier,
  type KpiKey,
  type RecentLeading,
} from "@/lib/client-health";

type MaturityInfo = {
  days: number;
  matured_through: string;
  clamped: boolean;
  empty: boolean;
  recent_window_days: number;
  recent_start: string;
  recent_end: string;
};
import { normalizeReportingType } from "@/lib/kpi-layouts";
import { callTypeLabel } from "@/lib/client-calls";
import { noteTypeLabel, reasonLabel } from "@/lib/client-feedback";
import ClientActionLog from "./ClientActionLog";
import ClientTimelineChart from "./ClientTimelineChart";
import ClientAiDiagnosis from "./ClientAiDiagnosis";

type Props = {
  clientId: string;
  clientName: string;
  startDate: string;
  endDate: string;
  onBack: () => void;
  onOpenClientFile?: () => void;
};

type CrmNote = { note_type: string; body: string; created_at: string; reason_code?: string | null };
type CrmCall = { call_type: string; called_at: string; notes?: string | null };
type HealthSnapshotRow = {
  id: string;
  period_start: string;
  period_end: string;
  worst_tier: string;
  constraint_label: string | null;
  created_at: string;
};

type DetailResponse = {
  client_id: string;
  client_name: string;
  is_live: boolean;
  reporting_type?: string;
  period: { start: string; end: string };
  prior_period: { start: string; end: string } | null;
  current: ClientHealthSnapshot;
  prior: ClientHealthSnapshot | null;
  recent?: RecentLeading | null;
  maturity?: MaturityInfo | null;
  trend: "improved" | "worsened" | "stable" | "new" | "insufficient";
  guidance: ConstraintGuidance;
};

const TIER_STYLES: Record<HealthTier, { bg: string; text: string; border: string }> = {
  critical: { bg: "rgba(239,68,68,0.18)", text: "#f87171", border: "rgba(239,68,68,0.4)" },
  below: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  at: { bg: "rgba(52,211,153,0.12)", text: "#34d399", border: "rgba(52,211,153,0.3)" },
  above: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.35)" },
  insufficient: { bg: "rgba(100,116,139,0.12)", text: "#64748b", border: "rgba(100,116,139,0.25)" },
};

const LAYER_GROUPS: { layer: FunnelLayer; label: string; keys: KpiKey[] }[] = [
  { layer: "L1", label: "L1 — Ads", keys: ["cpl", "cpql"] },
  { layer: "L2", label: "L2 — Landing", keys: ["lead_to_qualified"] },
  { layer: "L3", label: "L3 — Call center", keys: ["pickup_rate", "booking_rate"] },
  { layer: "L4", label: "L4 — Client / LO", keys: ["show_rate", "close_rate"] },
];

const HE_LAYER_GROUPS: { layer: FunnelLayer; label: string; keys: KpiKey[] }[] = [
  { layer: "L3", label: "L3 — Call center", keys: ["pickup_rate", "lead_booking_rate"] },
  { layer: "L4", label: "L4 — Client / LO", keys: ["show_rate"] },
];

function TierBadge({ tier }: { tier: HealthTier }) {
  const s = TIER_STYLES[tier];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

const cardStyle = {
  background: "#0a1628",
  border: "1px solid rgba(255,255,255,0.06)",
} as React.CSSProperties;

export default function ClientHealthDetail({ clientId, clientName, startDate, endDate, onBack, onOpenClientFile }: Props) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logReloadKey, setLogReloadKey] = useState(0);
  const [crmNotes, setCrmNotes] = useState<CrmNote[]>([]);
  const [crmCalls, setCrmCalls] = useState<CrmCall[]>([]);
  const [snapshots, setSnapshots] = useState<HealthSnapshotRow[]>([]);

  const load = useCallback(() => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    fetch(`/api/client-health/${clientId}?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load client diagnosis.");
        setLoading(false);
      });
  }, [clientId, startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/context`)
      .then(r => r.json())
      .then(d => {
        if (d.context) {
          setCrmNotes((d.context.notes ?? []).slice(0, 5) as CrmNote[]);
          setCrmCalls((d.context.calls ?? []).slice(0, 5) as CrmCall[]);
        }
      })
      .catch(() => {});
    fetch(`/api/client-health/${clientId}/snapshots?limit=8`)
      .then(r => r.json())
      .then(d => setSnapshots(d.snapshots ?? []))
      .catch(() => {});
  }, [clientId]);

  return (
    <div className="space-y-6 max-w-[1100px]">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium"
        style={{ color: "#94a3b8" }}
      >
        <span aria-hidden>←</span> Back to all clients
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-24" style={{ color: "#334155" }}>
          <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Loading {clientName}…</span>
        </div>
      ) : error ? (
        <div className="rounded-xl p-6 text-sm" style={{ ...cardStyle, color: "#f87171" }}>
          {error}
        </div>
      ) : data ? (
        (() => {
          const isHe = normalizeReportingType(data.reporting_type) === "HE";
          const layerGroups = isHe ? HE_LAYER_GROUPS : LAYER_GROUPS;
          const m = data.current.metrics;

          return (
        <>
          {/* Header */}
          <div className="rounded-xl p-5" style={cardStyle}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
                  {data.client_name}
                  {isHe && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                      HE
                    </span>
                  )}
                </h2>
                <p className="text-xs mt-1" style={{ color: "#475569" }}>
                  {data.period.start} → {data.period.end}
                  {data.prior_period ? ` · vs ${data.prior_period.start} → ${data.prior_period.end}` : ""}
                </p>
                {data.maturity && (data.maturity.empty || data.maturity.clamped) ? (
                  <p className="text-[11px] mt-1" style={{ color: "#38bdf8" }}>
                    Graded on selected range — includes the last {data.maturity.days}d still resolving, so
                    {isHe ? " show rate" : " CPConv / show / close"} may understate. See Recent below for leading signal.
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {onOpenClientFile && (
                  <button
                    type="button"
                    onClick={onOpenClientFile}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ color: "#38bdf8", background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.25)" }}
                  >
                    Open client file
                  </button>
                )}
                <TierBadge tier={data.current.worst_tier} />
              </div>
            </div>

            {data.recent ? (
              <div className="mt-3 rounded-lg px-3 py-2" style={{ background: "#050c18", border: "1px solid rgba(56,189,248,0.18)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#38bdf8" }}>
                  Recent {data.recent.window_days}d · leading indicators (early warning)
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                  <span>{data.recent.leads} leads</span>
                  <span>{data.recent.dials} dials</span>
                  <span>{data.recent.pickup_pct.toFixed(0)}% pickup</span>
                  {isHe ? (
                    <span>{data.recent.booking_rate.toFixed(1)}% booking (÷ leads)</span>
                  ) : (
                    <>
                      <span>{data.recent.lead_to_qualified_pct.toFixed(0)}% lead→qual</span>
                      <span>{data.recent.booking_rate.toFixed(0)}% booking</span>
                      <span>{data.recent.conversations} conversations</span>
                    </>
                  )}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {(isHe
                ? [
                    { label: "Outbound dials", value: String(m.outbound_dials) },
                    { label: "Booking rate (÷ leads)", value: `${m.lead_booking_rate.toFixed(1)}%` },
                    { label: "Net show rate", value: `${m.net_show_pct.toFixed(0)}%` },
                    { label: "Pickup rate", value: `${m.pickup_pct.toFixed(0)}%` },
                    { label: "Leads / booked", value: `${m.new_leads} / ${m.booked_appointments}` },
                  ]
                : [
                    { label: "CPConv (cost / conv)", value: money(data.current.cpconv) },
                    { label: "CPQL", value: money(data.current.cpql) },
                    { label: "Conversation yield", value: data.current.conversation_yield.toFixed(3) },
                    { label: "Leads / convs", value: `${m.new_leads} / ${m.live_transfers + m.claimed + m.shows}` },
                    { label: "LO bail rate (client-side)", value: `${m.lo_bail_rate.toFixed(0)}%` },
                  ]
              ).map(s => (
                <div key={s.label} className="rounded-lg px-3 py-2" style={{ background: "#050c18" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
                    {s.label}
                  </p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* What's wrong / what to do */}
          <div className="rounded-xl p-5" style={cardStyle}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: TIER_STYLES[data.current.worst_tier].text }}
              />
              <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
                Biggest fallout: {data.guidance.headline}
              </h3>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
              {data.guidance.whatsWrong}
            </p>

            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
                What to do
              </p>
              <ol className="space-y-2">
                {data.guidance.fixSteps.map((step, i) => (
                  <li
                    key={i}
                    className="rounded-lg px-3 py-2.5 text-sm"
                    style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}
                      >
                        {step.owner}
                      </span>
                      {step.timebox && (
                        <span className="text-[10px]" style={{ color: "#64748b" }}>
                          {step.timebox}
                        </span>
                      )}
                    </div>
                    <p style={{ color: "#cbd5e1" }}>{step.action}</p>
                    {step.successMetric && (
                      <p className="text-xs mt-1" style={{ color: "#34d399" }}>
                        Success: {step.successMetric}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            {data.guidance.doNotDo.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
                  Do not
                </p>
                <ul className="space-y-1">
                  {data.guidance.doNotDo.map((d, i) => (
                    <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: "#fb7185" }}>
                      <span aria-hidden>✕</span> {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[10px] mt-4" style={{ color: "#334155" }}>
              {data.guidance.cpconvMath}. {data.guidance.crossCheck}
            </p>
          </div>

          {/* Layer scorecard */}
          <div className="rounded-xl p-5" style={cardStyle}>
            <h3 className="text-base font-semibold mb-3" style={{ color: "#e2e8f0" }}>
              Layer scorecard
            </h3>
            <div className="space-y-3">
              {layerGroups.map(group => (
                <div key={group.layer}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#475569" }}>
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {group.keys.map(key => {
                      const g = data.current.grades.find(x => x.key === key);
                      if (!g) return null;
                      return (
                        <div
                          key={key}
                          className="rounded-lg px-3 py-2"
                          style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#475569" }}>
                            {KPI_META[key].short}
                          </p>
                          <p className="text-sm font-semibold tabular-nums mb-1" style={{ color: "#e2e8f0" }}>
                            {g.display}
                          </p>
                          <TierBadge tier={g.tier} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CRM context */}
          {(crmNotes.length > 0 || crmCalls.length > 0) && (
            <div className="rounded-xl p-5" style={cardStyle}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
                  Account context
                </h3>
                {onOpenClientFile && (
                  <button type="button" onClick={onOpenClientFile} className="text-xs font-semibold" style={{ color: "#38bdf8" }}>
                    View full file →
                  </button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>Recent notes</p>
                  {crmNotes.length === 0 ? (
                    <p className="text-xs" style={{ color: "#334155" }}>No notes yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {crmNotes.map((n, i) => (
                        <div key={i} className="rounded-lg px-3 py-2" style={{ background: "#050c18" }}>
                          <p className="text-[10px] uppercase tracking-wide" style={{ color: "#a78bfa" }}>{noteTypeLabel(n.note_type)}</p>
                          <p className="text-xs mt-1 line-clamp-3 whitespace-pre-wrap" style={{ color: "#94a3b8" }}>{n.body}</p>
                          {n.reason_code && <p className="text-[10px] mt-1" style={{ color: "#64748b" }}>{reasonLabel(n.reason_code)}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>Recent calls</p>
                  {crmCalls.length === 0 ? (
                    <p className="text-xs" style={{ color: "#334155" }}>No calls logged.</p>
                  ) : (
                    <div className="space-y-2">
                      {crmCalls.map((c, i) => (
                        <div key={i} className="rounded-lg px-3 py-2" style={{ background: "#050c18" }}>
                          <p className="text-[10px] uppercase tracking-wide" style={{ color: "#f59e0b" }}>{callTypeLabel(c.call_type)}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: "#64748b" }}>{c.called_at.slice(0, 10)}</p>
                          {c.notes && <p className="text-xs mt-1 line-clamp-2" style={{ color: "#94a3b8" }}>{c.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Frozen health snapshots */}
          {snapshots.length > 0 && (
            <div className="rounded-xl p-5" style={cardStyle}>
              <h3 className="text-base font-semibold mb-3" style={{ color: "#e2e8f0" }}>
                Health snapshot history
              </h3>
              <div className="space-y-2">
                {snapshots.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "#050c18" }}>
                    <div>
                      <p className="text-xs" style={{ color: "#cbd5e1" }}>
                        {s.period_start} → {s.period_end}
                      </p>
                      {s.constraint_label && (
                        <p className="text-[10px] mt-0.5" style={{ color: "#64748b" }}>{s.constraint_label}</p>
                      )}
                    </div>
                    <TierBadge tier={s.worst_tier as HealthTier} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI diagnosis */}
          <ClientAiDiagnosis
            clientId={data.client_id}
            endDate={data.period.end}
            defaultLayer={data.guidance.layer}
            onSavedAction={() => setLogReloadKey(k => k + 1)}
          />

          {/* Timeline & drop-off detection */}
          <ClientTimelineChart clientId={data.client_id} endDate={data.period.end} />

          {/* Change log & progress */}
          <ClientActionLog
            clientId={data.client_id}
            snapshot={data.current}
            defaultLayer={data.guidance.layer}
            defaultConstraintLabel={data.current.constraint_label}
            reloadKey={logReloadKey}
          />
        </>
          );
        })()
      ) : null}
    </div>
  );
}

function money(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

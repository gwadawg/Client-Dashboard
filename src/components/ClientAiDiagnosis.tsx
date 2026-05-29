"use client";

import { useState } from "react";
import type { AiActionItem, AiDiagnosis } from "@/lib/ai-diagnose";

type Props = {
  clientId: string;
  endDate: string;
  defaultLayer: string;
  onSavedAction: () => void;
};

const cardStyle = {
  background: "#0a1628",
  border: "1px solid rgba(255,255,255,0.06)",
} as React.CSSProperties;

export default function ClientAiDiagnosis({ clientId, endDate, defaultLayer, onSavedAction }: Props) {
  const [diagnosis, setDiagnosis] = useState<AiDiagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());

  const run = async () => {
    setLoading(true);
    setError(null);
    setSavedIdx(new Set());
    try {
      const res = await fetch(`/api/client-health/${clientId}/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end_date: endDate }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "AI diagnosis failed.");
      else setDiagnosis(data.diagnosis);
    } catch {
      setError("AI diagnosis request failed.");
    }
    setLoading(false);
  };

  const saveActionItem = async (item: AiActionItem, idx: number) => {
    const res = await fetch(`/api/client-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        title: item.action,
        layer: defaultLayer,
        constraint_label: diagnosis?.primary_constraint ?? null,
        hypothesis: `AI: ${item.do_not_do ? `do not ${item.do_not_do}` : "see plan"}`,
        change_description: `Owner: ${item.owner} · ${item.timebox}`,
        success_metric: "cpconv",
        ai_generated: true,
        status: "planned",
      }),
    });
    if (res.ok) {
      setSavedIdx(prev => new Set(prev).add(idx));
      onSavedAction();
    }
  };

  return (
    <div className="rounded-xl p-5" style={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
            AI diagnosis
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            Runs the CPConv playbook over W7/W14/W30 and returns a verdict + owner-tagged action plan.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: "rgba(167,139,250,0.18)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.35)" }}
        >
          {loading ? "Diagnosing…" : diagnosis ? "Re-run AI diagnosis" : "Run AI diagnosis"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {diagnosis && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded"
              style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}
            >
              {diagnosis.account_status}
            </span>
            <span className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
              {diagnosis.primary_constraint}
            </span>
            {diagnosis.cpconv_w14 != null && (
              <span className="text-xs" style={{ color: "#64748b" }}>
                CPConv ${Math.round(diagnosis.cpconv_w14)}
              </span>
            )}
          </div>

          {diagnosis.cpconv_explanation && (
            <p className="text-xs" style={{ color: "#94a3b8" }}>
              {diagnosis.cpconv_explanation}
            </p>
          )}

          {diagnosis.summary?.length > 0 && (
            <ul className="space-y-1">
              {diagnosis.summary.map((s, i) => (
                <li key={i} className="text-sm flex items-start gap-2" style={{ color: "#cbd5e1" }}>
                  <span style={{ color: "#a78bfa" }}>•</span> {s}
                </li>
              ))}
            </ul>
          )}

          {diagnosis.layer_scorecard?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "#475569" }}>
                    {["Metric", "W14", "Tier", "Owner"].map(h => (
                      <th key={h} className="text-left py-1.5 pr-3 font-bold uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diagnosis.layer_scorecard.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", color: "#94a3b8" }}>
                      <td className="py-1.5 pr-3">{r.metric}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.w14}</td>
                      <td className="py-1.5 pr-3">{r.tier}</td>
                      <td className="py-1.5 pr-3">{r.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {diagnosis.action_plan?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
                Action plan
              </p>
              <ol className="space-y-2">
                {diagnosis.action_plan.map((item, i) => (
                  <li
                    key={i}
                    className="rounded-lg px-3 py-2.5 text-sm"
                    style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}
                      >
                        {item.owner} · {item.timebox}
                      </span>
                      <button
                        type="button"
                        onClick={() => saveActionItem(item, i)}
                        disabled={savedIdx.has(i)}
                        className="text-[11px] px-2 py-1 rounded font-semibold"
                        style={{
                          background: savedIdx.has(i) ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)",
                          color: savedIdx.has(i) ? "#34d399" : "#94a3b8",
                        }}
                      >
                        {savedIdx.has(i) ? "Saved ✓" : "Save to log"}
                      </button>
                    </div>
                    <p style={{ color: "#cbd5e1" }}>{item.action}</p>
                    {item.success_metric && (
                      <p className="text-xs mt-1" style={{ color: "#34d399" }}>
                        Success: {item.success_metric}
                      </p>
                    )}
                    {item.do_not_do && (
                      <p className="text-xs mt-0.5" style={{ color: "#fb7185" }}>
                        Do not: {item.do_not_do}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {diagnosis.open_questions?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#475569" }}>
                Open questions
              </p>
              <ul className="space-y-1">
                {diagnosis.open_questions.map((q, i) => (
                  <li key={i} className="text-xs" style={{ color: "#64748b" }}>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

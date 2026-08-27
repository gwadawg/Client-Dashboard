"use client";

import {
  buildCallLogSummary,
  callLogHasDisplayContent,
  resultsLabel,
  sentimentLabel,
  storedToCallLogDraft,
  topicLabel,
  type StoredCallLogForm,
} from "@/lib/call-log-form";

export default function CheckinCallSummary({ form }: { form: StoredCallLogForm }) {
  if (!callLogHasDisplayContent(form)) return null;

  const draft = storedToCallLogDraft(form);

  return (
    <div
      className="mt-2 space-y-1.5 rounded-lg px-3 py-2"
      style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.12)" }}
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#38bdf8" }}>
        Call log
      </p>

      {(draft.health.client_sentiment ||
        draft.health.results_satisfaction ||
        draft.health.escalation_needed) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {draft.health.client_sentiment && (
            <span
              className="px-2 py-0.5 rounded-full"
              style={{ color: "#38bdf8", background: "rgba(56,189,248,0.12)" }}
            >
              {sentimentLabel(draft.health.client_sentiment)}
            </span>
          )}
          {draft.health.results_satisfaction && (
            <span
              className="px-2 py-0.5 rounded-full"
              style={{ color: "#94a3b8", background: "rgba(148,163,184,0.12)" }}
            >
              {resultsLabel(draft.health.results_satisfaction)}
            </span>
          )}
          {draft.health.escalation_needed && (
            <span
              className="px-2 py-0.5 rounded-full font-semibold"
              style={{ color: "#ef4444", background: "rgba(239,68,68,0.12)" }}
            >
              Escalation
            </span>
          )}
        </div>
      )}

      {draft.health.topics_discussed.length > 0 && (
        <p className="text-xs" style={{ color: "#64748b" }}>
          Topics: {draft.health.topics_discussed.map(topicLabel).join(", ")}
        </p>
      )}

      {draft.key_points.trim() && (
        <p className="text-sm whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>
          <span className="text-xs font-semibold" style={{ color: "#38bdf8" }}>Key points: </span>
          {draft.key_points}
        </p>
      )}

      {(draft.call_analysis.approach.trim() ||
        draft.call_analysis.discussed.trim() ||
        draft.call_analysis.expectations.trim()) && (
        <div className="space-y-1 text-sm" style={{ color: "#cbd5e1" }}>
          {draft.call_analysis.approach.trim() && (
            <p className="whitespace-pre-wrap">
              <span className="text-xs font-semibold" style={{ color: "#a78bfa" }}>Approach: </span>
              {draft.call_analysis.approach}
            </p>
          )}
          {draft.call_analysis.discussed.trim() && (
            <p className="whitespace-pre-wrap">
              <span className="text-xs font-semibold" style={{ color: "#a78bfa" }}>Discussed: </span>
              {draft.call_analysis.discussed}
            </p>
          )}
          {draft.call_analysis.expectations.trim() && (
            <p className="whitespace-pre-wrap">
              <span className="text-xs font-semibold" style={{ color: "#a78bfa" }}>Expectations: </span>
              {draft.call_analysis.expectations}
            </p>
          )}
        </div>
      )}

      {draft.wins.trim() && (
        <p className="text-sm whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>
          <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>Wins: </span>
          {draft.wins}
        </p>
      )}

      {draft.concerns.trim() && (
        <p className="text-sm whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>
          <span className="text-xs font-semibold" style={{ color: "#f59e0b" }}>Concerns: </span>
          {draft.concerns}
        </p>
      )}

      {draft.action_items.length > 0 && (
        <ul className="text-xs space-y-0.5" style={{ color: "#94a3b8" }}>
          {draft.action_items.map((item, i) => (
            <li key={`${item.owner}-${i}`}>
              <span className="font-semibold">{item.owner === "us" ? "Us" : "Client"}: </span>
              {item.text}
            </li>
          ))}
        </ul>
      )}

      {(draft.health.next_checkin_date || draft.health.follow_up_owner) && (
        <p className="text-xs" style={{ color: "#64748b" }}>
          {draft.health.next_checkin_date && <>Next check-in: {draft.health.next_checkin_date}</>}
          {draft.health.next_checkin_date && draft.health.follow_up_owner && " · "}
          {draft.health.follow_up_owner && <>Owner: {draft.health.follow_up_owner}</>}
        </p>
      )}

      <p className="text-[10px] sr-only">{buildCallLogSummary(form)}</p>
    </div>
  );
}

"use client";

import {
  buildCheckinSummary,
  resultsLabel,
  sentimentLabel,
  topicLabel,
  type StoredCheckinForm,
} from "@/lib/checkin-form";

export default function CheckinCallSummary({ form }: { form: StoredCheckinForm }) {
  if (!form.client_sentiment && !form.concerns_raised && !form.what_went_well) return null;

  return (
    <div className="mt-2 space-y-1.5 rounded-lg px-3 py-2" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.12)" }}>
      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#38bdf8" }}>Check-in summary</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {form.client_sentiment && (
          <span className="px-2 py-0.5 rounded-full" style={{ color: "#38bdf8", background: "rgba(56,189,248,0.12)" }}>
            {sentimentLabel(form.client_sentiment)}
          </span>
        )}
        {form.results_satisfaction && (
          <span className="px-2 py-0.5 rounded-full" style={{ color: "#94a3b8", background: "rgba(148,163,184,0.12)" }}>
            {resultsLabel(form.results_satisfaction)}
          </span>
        )}
        {form.escalation_needed && (
          <span className="px-2 py-0.5 rounded-full font-semibold" style={{ color: "#ef4444", background: "rgba(239,68,68,0.12)" }}>
            Escalation
          </span>
        )}
      </div>
      {form.topics_discussed && form.topics_discussed.length > 0 && (
        <p className="text-xs" style={{ color: "#64748b" }}>
          Topics: {form.topics_discussed.map(topicLabel).join(", ")}
        </p>
      )}
      {form.what_went_well && (
        <p className="text-sm whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>
          <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>Went well: </span>
          {form.what_went_well}
        </p>
      )}
      {form.concerns_raised && (
        <p className="text-sm whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>
          <span className="text-xs font-semibold" style={{ color: "#f59e0b" }}>Concerns: </span>
          {form.concerns_raised}
        </p>
      )}
      {form.our_action_items && (
        <p className="text-xs whitespace-pre-wrap" style={{ color: "#94a3b8" }}>
          <span className="font-semibold">Our actions: </span>{form.our_action_items}
        </p>
      )}
      {form.client_action_items && (
        <p className="text-xs whitespace-pre-wrap" style={{ color: "#94a3b8" }}>
          <span className="font-semibold">Client actions: </span>{form.client_action_items}
        </p>
      )}
      {(form.next_checkin_date || form.follow_up_owner) && (
        <p className="text-xs" style={{ color: "#64748b" }}>
          {form.next_checkin_date && <>Next check-in: {form.next_checkin_date}</>}
          {form.next_checkin_date && form.follow_up_owner && " · "}
          {form.follow_up_owner && <>Owner: {form.follow_up_owner}</>}
        </p>
      )}
      <p className="text-[10px] sr-only">{buildCheckinSummary(form)}</p>
    </div>
  );
}

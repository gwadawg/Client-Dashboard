"use client";

import {
  CHECKIN_RESULTS_OPTIONS,
  CHECKIN_SENTIMENT_OPTIONS,
  CHECKIN_TOPIC_OPTIONS,
  type CheckinFormData,
  type CheckinTopic,
} from "@/lib/checkin-form";

const fieldStyle = {
  background: "#050c18",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  outline: "none",
  width: "100%",
} as const;

export default function CheckinCallFormFields({
  value,
  onChange,
  disabled = false,
}: {
  value: CheckinFormData;
  onChange: (next: CheckinFormData) => void;
  disabled?: boolean;
}) {
  function patch<K extends keyof CheckinFormData>(key: K, val: CheckinFormData[K]) {
    onChange({ ...value, [key]: val });
  }

  function toggleTopic(topic: CheckinTopic) {
    const set = new Set(value.topics_discussed);
    if (set.has(topic)) set.delete(topic);
    else set.add(topic);
    patch("topics_discussed", [...set]);
  }

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{ background: "#060d1a", border: "1px solid rgba(56,189,248,0.2)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#38bdf8" }}>
        Check-in form
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Client sentiment <span style={{ color: "#f59e0b" }}>*</span>
          </span>
          <select
            value={value.client_sentiment}
            disabled={disabled}
            onChange={e => patch("client_sentiment", e.target.value as CheckinFormData["client_sentiment"])}
            className="mt-1 cursor-pointer"
            style={{
              ...fieldStyle,
              border: !value.client_sentiment ? "1px solid rgba(245,158,11,0.45)" : fieldStyle.border,
            }}
          >
            <option value="">Select…</option>
            {CHECKIN_SENTIMENT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Results satisfaction</span>
          <select
            value={value.results_satisfaction}
            disabled={disabled}
            onChange={e => patch("results_satisfaction", e.target.value as CheckinFormData["results_satisfaction"])}
            className="mt-1 cursor-pointer"
            style={fieldStyle}
          >
            <option value="">Select…</option>
            {CHECKIN_RESULTS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className="text-xs uppercase tracking-wider font-semibold block mb-2" style={{ color: "#475569" }}>
          Topics discussed
        </span>
        <div className="flex flex-wrap gap-2">
          {CHECKIN_TOPIC_OPTIONS.map(o => {
            const on = value.topics_discussed.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                onClick={() => toggleTopic(o.value)}
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  color: on ? "#38bdf8" : "#64748b",
                  background: on ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
                  border: on ? "1px solid rgba(56,189,248,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>What went well</span>
        <textarea
          value={value.what_went_well}
          disabled={disabled}
          onChange={e => patch("what_went_well", e.target.value)}
          rows={2}
          placeholder="Wins, positive feedback, momentum…"
          className="mt-1 resize-y"
          style={fieldStyle}
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Concerns raised</span>
        <textarea
          value={value.concerns_raised}
          disabled={disabled}
          onChange={e => patch("concerns_raised", e.target.value)}
          rows={2}
          placeholder="Issues, frustrations, risks…"
          className="mt-1 resize-y"
          style={fieldStyle}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Our action items</span>
          <textarea
            value={value.our_action_items}
            disabled={disabled}
            onChange={e => patch("our_action_items", e.target.value)}
            rows={3}
            placeholder="What we committed to do…"
            className="mt-1 resize-y"
            style={fieldStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Client action items</span>
          <textarea
            value={value.client_action_items}
            disabled={disabled}
            onChange={e => patch("client_action_items", e.target.value)}
            rows={3}
            placeholder="What the client committed to…"
            className="mt-1 resize-y"
            style={fieldStyle}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Next check-in date</span>
          <input
            type="date"
            value={value.next_checkin_date}
            disabled={disabled}
            onChange={e => patch("next_checkin_date", e.target.value)}
            className="mt-1"
            style={fieldStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Follow-up owner</span>
          <input
            value={value.follow_up_owner}
            disabled={disabled}
            onChange={e => patch("follow_up_owner", e.target.value)}
            placeholder="Who owns follow-up"
            className="mt-1"
            style={fieldStyle}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value.escalation_needed}
          disabled={disabled}
          onChange={e => patch("escalation_needed", e.target.checked)}
          className="rounded"
        />
        <span className="text-sm" style={{ color: value.escalation_needed ? "#ef4444" : "#cbd5e1" }}>
          Escalation needed (leadership / CS review)
        </span>
      </label>
    </div>
  );
}

"use client";

import type { CallAnalysisData } from "@/lib/call-log-form";

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

export default function CallAnalysisFields({
  value,
  onChange,
  disabled = false,
}: {
  value: CallAnalysisData;
  onChange: (next: CallAnalysisData) => void;
  disabled?: boolean;
}) {
  function patch<K extends keyof CallAnalysisData>(key: K, val: CallAnalysisData[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{ background: "#060d1a", border: "1px solid rgba(167,139,250,0.2)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a78bfa" }}>
        Call analysis
      </p>
      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
          Approach
        </span>
        <textarea
          value={value.approach}
          disabled={disabled}
          onChange={e => patch("approach", e.target.value)}
          rows={2}
          placeholder="How we ran the call…"
          className="mt-1 resize-y"
          style={fieldStyle}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
          Discussed
        </span>
        <textarea
          value={value.discussed}
          disabled={disabled}
          onChange={e => patch("discussed", e.target.value)}
          rows={2}
          placeholder="What came up…"
          className="mt-1 resize-y"
          style={fieldStyle}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
          Expectations
        </span>
        <textarea
          value={value.expectations}
          disabled={disabled}
          onChange={e => patch("expectations", e.target.value)}
          rows={2}
          placeholder="What we agreed / next expectations…"
          className="mt-1 resize-y"
          style={fieldStyle}
        />
      </label>
    </div>
  );
}

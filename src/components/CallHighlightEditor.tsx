"use client";

import type { HighlightDraft } from "@/lib/team-call-draft";

type Props = {
  highlights: HighlightDraft[];
  onChange: (highlights: HighlightDraft[]) => void;
  disabled?: boolean;
};

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
} as const;

export default function CallHighlightEditor({ highlights, onChange, disabled }: Props) {
  function patch(index: number, patch: Partial<HighlightDraft>) {
    onChange(highlights.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }

  function remove(index: number) {
    onChange(highlights.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...highlights, { timestamp: "", label: "", takeaway: "" }]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
          Highlight moments
          <span className="normal-case font-normal tracking-normal ml-1" style={{ color: "#334155" }}>
            (optional)
          </span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className="text-xs font-semibold px-2 py-1 rounded"
          style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)" }}
        >
          + Add moment
        </button>
      </div>

      {highlights.length === 0 ? (
        <p className="text-xs" style={{ color: "#475569" }}>
          Optional — add timestamped takeaways if useful (e.g. 12:34 for a key decision).
        </p>
      ) : (
        highlights.map((h, i) => (
          <div
            key={i}
            className="rounded-lg p-3 space-y-2"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                disabled={disabled}
                value={h.timestamp}
                onChange={e => patch(i, { timestamp: e.target.value })}
                placeholder="MM:SS"
                style={{ ...fieldStyle, width: 80, flexShrink: 0 }}
              />
              <input
                type="text"
                disabled={disabled}
                value={h.label}
                onChange={e => patch(i, { label: e.target.value })}
                placeholder="Label (e.g. Objection handling)"
                style={fieldStyle}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(i)}
                className="text-xs px-2 py-1 rounded shrink-0"
                style={{ color: "#f87171" }}
              >
                Remove
              </button>
            </div>
            <textarea
              disabled={disabled}
              value={h.takeaway}
              onChange={e => patch(i, { takeaway: e.target.value })}
              placeholder="What made this moment valuable?"
              rows={2}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </div>
        ))
      )}
    </div>
  );
}

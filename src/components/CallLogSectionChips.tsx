"use client";

import {
  CALL_LOG_SECTION_OPTIONS,
  type CallLogSectionId,
} from "@/lib/call-log-form";

export default function CallLogSectionChips({
  sections,
  onToggle,
  disabled = false,
}: {
  sections: CallLogSectionId[];
  onToggle: (id: CallLogSectionId) => void;
  disabled?: boolean;
}) {
  const on = new Set(sections);

  return (
    <div className="space-y-2">
      <span className="text-xs uppercase tracking-wider font-semibold block" style={{ color: "#475569" }}>
        Add to this log
      </span>
      <div className="flex flex-wrap gap-2">
        {CALL_LOG_SECTION_OPTIONS.map(o => {
          const active = on.has(o.id);
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(o.id)}
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                color: active ? "#38bdf8" : "#64748b",
                background: active ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
                border: active ? "1px solid rgba(56,189,248,0.35)" : "1px solid rgba(255,255,255,0.08)",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {active ? `✓ ${o.label}` : `+ ${o.label}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

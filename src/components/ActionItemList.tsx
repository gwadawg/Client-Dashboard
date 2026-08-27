"use client";

import type { ActionItemOwner, CallActionItem } from "@/lib/call-log-form";

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

export default function ActionItemList({
  items,
  onChange,
  disabled = false,
}: {
  items: CallActionItem[];
  onChange: (items: CallActionItem[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<CallActionItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...items, { text: "", owner: "us" }]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
          Action items
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className="text-xs font-semibold px-2 py-1 rounded-lg"
          style={{
            color: "#38bdf8",
            background: "rgba(56,189,248,0.1)",
            border: "1px solid rgba(56,189,248,0.25)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          + Add
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs" style={{ color: "#64748b" }}>No action items yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2 items-start">
              <input
                value={item.text}
                disabled={disabled}
                onChange={e => update(index, { text: e.target.value })}
                placeholder="What needs to happen…"
                className="flex-1"
                style={fieldStyle}
              />
              <select
                value={item.owner}
                disabled={disabled}
                onChange={e => update(index, { owner: e.target.value as ActionItemOwner })}
                className="cursor-pointer shrink-0"
                style={{ ...fieldStyle, width: "6.5rem" }}
              >
                <option value="us">Us</option>
                <option value="client">Client</option>
              </select>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(index)}
                className="text-xs font-semibold px-2 py-2 shrink-0"
                style={{ color: "#64748b" }}
                aria-label="Remove action item"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { splitPlaceholders } from "@/lib/library-markdown";

type CalloutType = "operator" | "critical";

const STYLES: Record<CalloutType, { border: string; bg: string; color: string; label: string }> = {
  operator: {
    border: "#38bdf8",
    bg: "rgba(56,189,248,0.08)",
    color: "#7dd3fc",
    label: "Operator note",
  },
  critical: {
    border: "#f87171",
    bg: "rgba(248,113,113,0.08)",
    color: "#fca5a5",
    label: "Critical",
  },
};

type Props = {
  type: CalloutType;
  children: React.ReactNode;
};

function renderWithPlaceholders(text: string) {
  const parts = splitPlaceholders(text);
  return parts.map((p, i) =>
    p.type === "placeholder" ? (
      <span
        key={i}
        className="mx-0.5 rounded px-1.5 py-0.5 text-[0.9em] font-semibold"
        style={{ background: "rgba(245,158,11,0.18)", color: "#fbbf24" }}
      >
        {p.value}
      </span>
    ) : (
      <span key={i}>{p.value}</span>
    ),
  );
}

export default function CalloutBlock({ type, children }: Props) {
  const s = STYLES[type];
  const text = typeof children === "string" ? children : String(children ?? "");

  return (
    <div
      className="my-3 rounded-xl px-4 py-3 text-sm leading-relaxed"
      style={{ background: s.bg, borderLeft: `3px solid ${s.border}` }}
    >
      <span
        className="mb-1 block text-[10px] font-bold uppercase tracking-widest"
        style={{ color: s.border }}
      >
        {s.label}
      </span>
      <div style={{ color: s.color }}>{renderWithPlaceholders(text)}</div>
    </div>
  );
}

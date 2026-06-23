"use client";

import { CLIENT_LEAD_SOURCES } from "@/lib/client-lead-source";

const fieldStyle = (missing = false) => ({
  background: "#0f2040",
  border: missing ? "1px solid rgba(245,158,11,0.45)" : "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
});

export function ClientLeadSourceSelectOptions({ includeBlank = true }: { includeBlank?: boolean }) {
  return (
    <>
      {includeBlank && <option value="">Select source…</option>}
      {CLIENT_LEAD_SOURCES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </>
  );
}

export default function ClientLeadSourceSelect({
  value,
  onChange,
  disabled,
  className,
  includeBlank = true,
  highlightEmpty,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  includeBlank?: boolean;
  highlightEmpty?: boolean;
}) {
  const missing = highlightEmpty && !value;
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={className ?? "px-2 py-1.5 rounded-lg text-sm outline-none cursor-pointer w-full"}
      style={fieldStyle(missing)}
    >
      <ClientLeadSourceSelectOptions includeBlank={includeBlank} />
    </select>
  );
}

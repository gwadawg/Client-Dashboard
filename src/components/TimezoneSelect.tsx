"use client";

import { US_CLIENT_TIMEZONES, isKnownUsClientTimezone } from "@/lib/us-timezones";

export default function TimezoneSelect({
  value,
  onChange,
  disabled = false,
  className,
  highlightEmpty = false,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  highlightEmpty?: boolean;
}) {
  const current = value ?? "";
  const missing = highlightEmpty && !current;
  const showLegacy = current && !isKnownUsClientTimezone(current);

  return (
    <select
      value={current}
      disabled={disabled}
      onChange={e => onChange(e.target.value || null)}
      className={className ?? "px-2 py-1 rounded-lg text-xs outline-none cursor-pointer w-full min-w-[9rem]"}
      style={{
        background: "#0f2040",
        border: missing ? "1px solid rgba(245,158,11,0.45)" : "1px solid rgba(255,255,255,0.12)",
        color: current ? "#e2e8f0" : "#64748b",
        opacity: disabled ? 0.5 : 1,
      }}
      title="Client reporting timezone"
    >
      <option value="">—</option>
      {US_CLIENT_TIMEZONES.map(t => (
        <option key={t.value} value={t.value}>{t.label}</option>
      ))}
      {showLegacy && (
        <option value={current}>{current} (saved)</option>
      )}
    </select>
  );
}

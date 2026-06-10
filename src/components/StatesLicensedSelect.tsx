"use client";

import { useEffect, useRef, useState } from "react";
import { US_STATES, formatStatesLicensed } from "@/lib/us-states";

export default function StatesLicensedSelect({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string[] | null | undefined;
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = new Set((value ?? []).map(c => c.toUpperCase()));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange([...next].sort());
  }

  const label = !value?.length
    ? "Select states…"
    : value.length <= 4
      ? formatStatesLicensed(value)
      : `${value.length} states`;

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="px-2 py-1 rounded-lg text-xs text-left outline-none w-full min-w-[7rem] max-w-[9rem] truncate"
        style={{
          background: "#0f2040",
          border: `1px solid ${!value?.length ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.12)"}`,
          color: value?.length ? "#e2e8f0" : "#64748b",
          opacity: disabled ? 0.5 : 1,
        }}
        title={value?.length ? formatStatesLicensed(value) : "States this client is licensed in"}
      >
        {label}
      </button>
      {open && !disabled && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-xl shadow-xl overflow-hidden"
          style={{
            width: 220,
            maxHeight: 280,
            background: "#0a1628",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>Licensed in</span>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-semibold"
                style={{ color: "#64748b" }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="overflow-y-auto p-2" style={{ maxHeight: 236 }}>
            {US_STATES.map(({ code, name }) => (
              <label
                key={code}
                className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={selected.has(code)}
                  onChange={() => toggle(code)}
                  className="rounded"
                />
                <span className="text-xs font-mono w-6" style={{ color: "#94a3b8" }}>{code}</span>
                <span className="text-xs truncate" style={{ color: "#e2e8f0" }}>{name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

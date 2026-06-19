"use client";

import { useEffect, useRef, useState } from "react";
import {
  type DatePreset,
  PRESET_LABELS,
  PRESET_ORDER,
} from "@/lib/date-presets";

type Props = {
  preset: DatePreset;
  customStart: string;
  customEnd: string;
  onPresetChange: (preset: DatePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  /** Compact styling for in-page filter bars (default: header style). */
  variant?: "header" | "inline";
};

export default function DateRangeFilter({
  preset,
  customStart,
  customEnd,
  onPresetChange,
  onCustomStartChange,
  onCustomEndChange,
  variant = "header",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isInline = variant === "inline";
  const inputStyle = {
    background: isInline ? "#161820" : "#0f2040",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 rounded-lg text-sm font-medium transition-colors"
          style={
            isInline
              ? { background: "#f59e0b", color: "#fff", padding: "6px 12px", minWidth: "8.5rem" }
              : { background: "#f59e0b", color: "#fff", padding: "8px 16px", minWidth: "9rem" }
          }
        >
          <span className="flex-1 text-left">{PRESET_LABELS[preset]}</span>
          <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div
            className="absolute top-full right-0 mt-1.5 rounded-xl overflow-hidden z-30 w-48"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}
          >
            {PRESET_ORDER.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => { onPresetChange(p); setOpen(false); }}
                className="block w-full text-left px-4 py-2.5 text-sm transition-colors"
                style={
                  preset === p
                    ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontWeight: 600 }
                    : { color: "#94a3b8" }
                }
                onMouseEnter={e => { if (preset !== p) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (preset !== p) (e.currentTarget as HTMLElement).style.background = ""; }}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      {preset === "custom" && (
        <>
          <input
            type="date"
            value={customStart}
            onChange={e => onCustomStartChange(e.target.value)}
            className="rounded-lg text-sm outline-none"
            style={{ ...inputStyle, padding: isInline ? "6px 10px" : "8px 12px" }}
          />
          <span className="text-sm" style={{ color: "#334155" }}>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => onCustomEndChange(e.target.value)}
            className="rounded-lg text-sm outline-none"
            style={{ ...inputStyle, padding: isInline ? "6px 10px" : "8px 12px" }}
          />
        </>
      )}
    </div>
  );
}

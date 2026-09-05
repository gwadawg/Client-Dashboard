"use client";

import { useEffect, useRef, useState } from "react";
import { compactLicensedStates } from "@/lib/roster-media-view";
import { usStateName } from "@/lib/us-states";

export default function RosterStatesCell({ codes }: { codes: string[] | null | undefined }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const r = compactLicensedStates(codes);
  const list = codes?.length ? codes : [];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (r.muted) {
    return <span className="text-xs" style={{ color: "#334155" }}>—</span>;
  }

  return (
    <div ref={rootRef} className="relative inline-block max-w-full">
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        className="text-xs whitespace-nowrap rounded px-1.5 py-0.5 transition-colors"
        style={{
          color: "#cbd5e1",
          background: open ? "rgba(56,189,248,0.12)" : "transparent",
          border: `1px solid ${open ? "rgba(56,189,248,0.35)" : "transparent"}`,
        }}
        aria-expanded={open}
        title={r.title}
      >
        {r.text}
        <span className="ml-1 opacity-60" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-1 min-w-[11rem] max-h-56 overflow-y-auto rounded-lg py-1 shadow-lg"
          style={{
            background: "#0f2040",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
          onClick={e => e.stopPropagation()}
        >
          {list.map(code => (
            <div
              key={code}
              className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-xs"
            >
              <span className="font-semibold tabular-nums" style={{ color: "#e2e8f0" }}>
                {code}
              </span>
              <span style={{ color: "#94a3b8" }}>{usStateName(code)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

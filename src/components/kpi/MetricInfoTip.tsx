"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type MetricHint = {
  /** What the number means in plain English. */
  definition: string;
  /** Tables / systems the metric reads from. */
  source: string;
  /** Exact calculation. */
  formula: string;
};

type Props = {
  hint: MetricHint | string;
  children?: ReactNode;
};

const TIP_WIDTH = 288; // w-72
const EDGE_PAD = 12;

/** Small “i” control with a hover/focus panel: Definition · Source · Formula. */
export default function MetricInfoTip({ hint }: Props) {
  const isStructured = typeof hint !== "string";
  const structured: MetricHint = isStructured
    ? hint
    : { definition: hint, source: "", formula: "" };

  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // Prefer right-align under the icon; clamp so left edge never slides under the sidebar.
    let left = rect.right - TIP_WIDTH;
    left = Math.max(EDGE_PAD, Math.min(left, window.innerWidth - TIP_WIDTH - EDGE_PAD));
    setCoords({ top: rect.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const tip =
    open &&
    coords &&
    typeof document !== "undefined" &&
    createPortal(
      <span
        role="tooltip"
        className="pointer-events-none fixed z-[100] w-72 rounded-lg p-3"
        style={{
          top: coords.top,
          left: coords.left,
          background: "#0a1424",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        }}
      >
        <HintBlock
          label={isStructured ? "Definition" : "About"}
          text={structured.definition}
          last={!isStructured}
        />
        {isStructured && (
          <>
            <HintBlock label="Source" text={structured.source} />
            <HintBlock label="Formula" text={structured.formula} last />
          </>
        )}
      </span>,
      document.body,
    );

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        ref={btnRef}
        type="button"
        className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold cursor-help select-none outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60"
        style={{ background: "rgba(148,163,184,0.15)", color: "#64748b" }}
        aria-label={
          isStructured
            ? `${structured.definition}. Source: ${structured.source}. Formula: ${structured.formula}`
            : structured.definition
        }
      >
        i
      </button>
      {tip}
    </span>
  );
}

function HintBlock({
  label,
  text,
  last,
}: {
  label: string;
  text: string;
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "mb-2.5"}>
      <p
        className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
        style={{ color: "#64748b" }}
      >
        {label}
      </p>
      <p className="text-[11px] leading-snug" style={{ color: "#cbd5e1" }}>
        {text}
      </p>
    </div>
  );
}

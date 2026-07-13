import type { ReactNode } from "react";

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

/** Small “i” control with a hover/focus panel: Definition · Source · Formula. */
export default function MetricInfoTip({ hint }: Props) {
  const isStructured = typeof hint !== "string";
  const structured: MetricHint = isStructured
    ? hint
    : { definition: hint, source: "", formula: "" };

  return (
    <span className="relative inline-flex group/tip">
      <button
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
      <span
        role="tooltip"
        className="pointer-events-none absolute z-50 right-0 top-full mt-2 w-72 rounded-lg p-3 opacity-0 scale-95 origin-top-right transition duration-150 group-hover/tip:opacity-100 group-hover/tip:scale-100 group-focus-within/tip:opacity-100 group-focus-within/tip:scale-100 motion-reduce:transition-none"
        style={{
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
      </span>
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

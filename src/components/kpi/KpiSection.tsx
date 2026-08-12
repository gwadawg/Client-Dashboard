import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  footnote?: string;
  showDivider?: boolean;
  /** Trailing text beside the header, e.g. a hidden-card count when collapsed. */
  meta?: string;
  /** When set the header becomes a disclosure button. Omit for a static section. */
  open?: boolean;
  onToggle?: () => void;
};

export default function KpiSection({
  title,
  children,
  footnote,
  showDivider,
  meta,
  open,
  onToggle,
}: Props) {
  const collapsible = typeof open === "boolean" && Boolean(onToggle);
  const expanded = !collapsible || open;

  const heading = (
    <>
      <span
        className="font-display text-xs font-bold uppercase tracking-widest"
        style={{ color: "var(--color-ws-text-ghost)" }}
      >
        {title}
      </span>
      {meta && (
        <span className="font-data text-[10px] tabular-nums" style={{ color: "var(--color-ws-text-faint)" }}>
          {meta}
        </span>
      )}
    </>
  );

  return (
    <section>
      {showDivider && (
        <div className="mb-5" style={{ borderTop: "1px solid var(--color-ws-hairline-soft)" }} />
      )}

      {collapsible ? (
        <h2 className="mb-4">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="group flex items-center gap-2 py-0.5 transition-colors ease-ws"
          >
            <svg
              className="w-3 h-3 shrink-0 transition-transform duration-200 ease-ws"
              style={{
                color: "var(--color-ws-text-faint)",
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {heading}
          </button>
        </h2>
      ) : (
        <h2 className="flex items-center gap-2 mb-4">{heading}</h2>
      )}

      {expanded && (
        <>
          {children}
          {footnote && (
            <p className="text-[10px] mt-3 px-1 leading-relaxed" style={{ color: "var(--color-ws-text-faint)" }}>
              {footnote}
            </p>
          )}
        </>
      )}
    </section>
  );
}

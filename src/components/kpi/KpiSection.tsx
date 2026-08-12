import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  footnote?: string;
  /** Trailing text beside the header, e.g. a hidden-card count when collapsed. */
  meta?: string;
  /** When set the header becomes a disclosure button. Omit for a static section. */
  open?: boolean;
  onToggle?: () => void;
};

/**
 * Section header doubles as the divider: label, then a hairline running to the
 * right edge. One element instead of a separate rule above a near-invisible
 * caption, which is what made the sections blur together.
 */
export default function KpiSection({ title, children, footnote, meta, open, onToggle }: Props) {
  const collapsible = typeof open === "boolean" && Boolean(onToggle);
  const expanded = !collapsible || open;

  const heading = (
    <>
      {collapsible && (
        <svg
          className="h-3 w-3 shrink-0 transition-transform duration-200 ease-ws"
          style={{
            color: "var(--color-ws-text-dim)",
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
      )}
      <span
        className="font-display shrink-0 text-[11px] font-bold uppercase tracking-[0.18em]"
        style={{ color: "var(--color-ws-text-muted)" }}
      >
        {title}
      </span>
      <span
        aria-hidden
        className="h-px flex-1"
        style={{ background: "var(--color-ws-hairline)" }}
      />
      {meta && (
        <span
          className="font-data shrink-0 text-[10px] tabular-nums"
          style={{ color: "var(--color-ws-text-dim)" }}
        >
          {meta}
        </span>
      )}
    </>
  );

  return (
    <section>
      <h2 className="mb-3">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex w-full items-center gap-2.5 py-0.5 text-left transition-colors ease-ws"
          >
            {heading}
          </button>
        ) : (
          <span className="flex w-full items-center gap-2.5 py-0.5">{heading}</span>
        )}
      </h2>

      {expanded && (
        <>
          {children}
          {footnote && (
            <p
              className="mt-2.5 max-w-4xl text-[11px] leading-relaxed"
              style={{ color: "var(--color-ws-text-dim)" }}
            >
              {footnote}
            </p>
          )}
        </>
      )}
    </section>
  );
}

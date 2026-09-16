"use client";

type Segment = {
  key: string;
  label: string;
};

type Props = {
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
};

/** Mutually exclusive choices for the current view. Text labels only. */
export default function SegmentedControl({
  segments,
  value,
  onChange,
  ariaLabel,
}: Props) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex max-w-full min-h-11 p-1 rounded-pill ring-1 ring-white/10 ws-glass-track overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {segments.map(segment => {
        const active = segment.key === value;
        return (
          <button
            key={segment.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.key)}
            className={[
              "relative min-h-9 px-4 rounded-pill text-sm font-medium whitespace-nowrap",
              "transition-[background-color,color,transform] duration-med ease-ws",
              "active:scale-[0.98] ws-focus-ring",
              active
                ? "bg-white/12 text-[var(--color-ws-label)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                : "text-[var(--color-ws-quaternary)] hover:text-[var(--color-ws-tertiary)]",
            ].join(" ")}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

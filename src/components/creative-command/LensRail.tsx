"use client";

import { LENSES, type LensId } from "@/lib/ad-creative-lenses";
import { Kicker } from "./ui";

type Props = {
  active: LensId;
  counts: Record<LensId, number>;
  onSelect: (id: LensId) => void;
};

/** The preset questions. Each carries its own match count so an empty answer is visible before clicking. */
export default function LensRail({ active, counts, onSelect }: Props) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "var(--color-ws-panel)", border: "1px solid var(--color-ws-hairline)" }}
    >
      <Kicker>Ask</Kicker>
      <div className="flex flex-wrap gap-2 mt-2">
        {LENSES.map((lens) => {
          const isActive = lens.id === active;
          const n = counts[lens.id] ?? 0;
          const empty = n === 0 && !lens.portfolio;
          return (
            <button
              key={lens.id}
              type="button"
              onClick={() => onSelect(lens.id)}
              aria-pressed={isActive}
              className="px-3 py-1.5 rounded-lg text-xs text-left transition-colors"
              style={{
                transitionTimingFunction: "var(--ease-ws)",
                transitionDuration: "180ms",
                background: isActive
                  ? `color-mix(in srgb, ${lens.accent} 14%, transparent)`
                  : "rgba(255,255,255,0.03)",
                color: isActive ? lens.accent : empty ? "var(--color-ws-text-faint)" : "var(--color-ws-text-muted)",
                border: isActive
                  ? `1px solid color-mix(in srgb, ${lens.accent} 45%, transparent)`
                  : "1px solid var(--color-ws-hairline)",
              }}
            >
              <span>{lens.question}</span>
              {lens.portfolio ? null : (
                <span
                  className="ml-2 tabular-nums"
                  style={{
                    fontFamily: "var(--font-data), monospace",
                    color: isActive ? lens.accent : "var(--color-ws-text-faint)",
                  }}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

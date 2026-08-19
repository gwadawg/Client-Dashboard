"use client";

import { useMemo } from "react";
import {
  DIAGNOSIS_COLORS,
  DIAGNOSIS_LABELS,
  type CreativeIntelRow,
  type IntelWindow,
} from "@/lib/ad-creative-lenses";
import { Empty, Panel, money } from "./ui";

const MAX_ROWS = 18;

function dayIndex(date: string, start: string): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000,
  );
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One bar per creative, spanning first to last day with spend. Reading age and
 * "is it still running" off the same row is what makes a stopped ad obvious —
 * a bar that ends short of the right edge is not delivering any more.
 */
export default function LifecycleTimeline({
  ads,
  window: win,
  onOpen,
}: {
  ads: CreativeIntelRow[];
  window: IntelWindow;
  onOpen: (ad: CreativeIntelRow) => void;
}) {
  const rows = useMemo(
    () =>
      ads
        .filter((a) => a.first_spend_date && a.last_spend_date)
        .sort((a, b) => (b.days_live ?? 0) - (a.days_live ?? 0))
        .slice(0, MAX_ROWS),
    [ads],
  );

  if (!win.start || !win.end || rows.length === 0) {
    return (
      <Panel title="Lifecycle">
        <Empty>No creative recorded spend in this window.</Empty>
      </Panel>
    );
  }

  const span = Math.max(dayIndex(win.end, win.start), 1);

  return (
    <Panel
      title="Lifecycle"
      hint={`Longest-running creatives first. Bars span first to last day with spend, ${shortDate(win.start)} to ${shortDate(win.end)}.`}
    >
      <div className="space-y-1.5">
        {rows.map((ad) => {
          const from = dayIndex(ad.first_spend_date!, win.start!);
          const to = dayIndex(ad.last_spend_date!, win.start!);
          const left = (from / span) * 100;
          const width = Math.max(((to - from) / span) * 100, 1.2);
          const color = DIAGNOSIS_COLORS[ad.diagnosis];
          return (
            <button
              key={ad.row_key}
              type="button"
              onClick={() => onOpen(ad)}
              className="w-full flex items-center gap-3 group text-left"
              title={`${ad.ad_name} — ${DIAGNOSIS_LABELS[ad.diagnosis]} · ${shortDate(ad.first_spend_date!)} to ${shortDate(ad.last_spend_date!)} · ${money(ad.spend)}`}
            >
              <span
                className="text-[11px] truncate w-40 flex-shrink-0 transition-colors"
                style={{ color: "var(--color-ws-text-muted)" }}
              >
                {ad.ad_name}
              </span>
              <span className="relative flex-1 h-3 rounded" style={{ background: "rgba(255,255,255,0.035)" }}>
                <span
                  className="absolute top-0 h-3 rounded"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: color,
                    opacity: 0.75,
                    transition: "opacity 180ms var(--ease-ws)",
                  }}
                />
              </span>
              <span
                className="text-[10px] tabular-nums w-14 text-right flex-shrink-0"
                style={{ color: "var(--color-ws-text-faint)", fontFamily: "var(--font-data), monospace" }}
              >
                {ad.days_live}d
              </span>
              <span
                className="text-[10px] tabular-nums w-16 text-right flex-shrink-0"
                style={{ color: "var(--color-ws-text-faint)", fontFamily: "var(--font-data), monospace" }}
              >
                {money(ad.spend)}
              </span>
            </button>
          );
        })}
      </div>
      {ads.length > MAX_ROWS ? (
        <p className="text-[10px] mt-3" style={{ color: "var(--color-ws-text-ghost)" }}>
          Showing the {MAX_ROWS} longest-running of {ads.length} creatives.
        </p>
      ) : null}
    </Panel>
  );
}

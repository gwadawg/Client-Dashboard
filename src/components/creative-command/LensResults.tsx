"use client";

import { useState } from "react";
import { adFormatLabel } from "@/lib/ad-formats";
import {
  PRODUCT_COLORS,
  PRODUCT_LABELS,
  type CreativeIntelRow,
  type LensDef,
} from "@/lib/ad-creative-lenses";
import {
  Chip,
  Delta,
  DiagnosisBadge,
  Empty,
  count,
  deltaText,
  driveThumb,
  money,
  money2,
  pct,
} from "./ui";

type Evidence = { label: string; value: string; tone?: string; node?: React.ReactNode };

/**
 * Show the numbers that actually triggered the lens rather than a fixed column
 * set — the point of a preset question is that the evidence is already selected.
 */
function evidenceFor(lens: LensDef["id"], ad: CreativeIntelRow): Evidence[] {
  const spend = { label: "Spend", value: money(ad.spend) };
  switch (lens) {
    case "working":
      return [
        { label: "CPCONV idx", value: ad.cpconv_index != null ? `${ad.cpconv_index.toFixed(2)}x` : "—", tone: "var(--color-ws-positive)" },
        { label: "CPCONV", value: money2(ad.cp_conversation) },
        { label: "Qual %", value: pct(ad.qualified_rate) },
        spend,
      ];
    case "fatiguing":
      return [
        { label: "CTR Δ", value: deltaText(ad.ctr_delta_pct), node: <Delta value={ad.ctr_delta_pct} goodWhen="up" /> },
        { label: "CPCONV Δ", value: deltaText(ad.cpconv_delta_pct), node: <Delta value={ad.cpconv_delta_pct} goodWhen="down" /> },
        { label: "Days live", value: count(ad.days_live) },
        spend,
      ];
    case "funnel":
      return [
        { label: "CTR Δ", value: deltaText(ad.ctr_delta_pct), node: <Delta value={ad.ctr_delta_pct} goodWhen="up" /> },
        { label: "CPCONV Δ", value: deltaText(ad.cpconv_delta_pct), node: <Delta value={ad.cpconv_delta_pct} goodWhen="down" /> },
        { label: "Clients", value: count(ad.client_count) },
        spend,
      ];
    case "wrong_person":
      return [
        { label: "CPL", value: money2(ad.cpl), tone: "var(--color-ws-positive)" },
        { label: "Qual %", value: pct(ad.qualified_rate), tone: "var(--color-ws-negative)" },
        { label: "Show rate", value: pct(ad.show_rate) },
        spend,
      ];
    case "test_queue":
      return [
        { label: "CTR", value: pct(ad.ctr, 2), tone: "var(--color-ws-positive)" },
        { label: "Cluster CTR", value: pct(ad.cluster_ctr_median, 2) },
        { label: "Opt-in", value: pct(ad.optin_rate), tone: "var(--color-ws-positive)" },
        spend,
      ];
    case "longest":
      return [
        { label: "Days live", value: count(ad.days_live) },
        { label: "Days w/ spend", value: count(ad.active_days) },
        { label: "CPCONV idx", value: ad.cpconv_index != null ? `${ad.cpconv_index.toFixed(2)}x` : "—" },
        spend,
      ];
    case "dead":
      return [
        { label: "Idle days", value: count(ad.days_since_spend) },
        { label: "CPCONV idx", value: ad.cpconv_index != null ? `${ad.cpconv_index.toFixed(2)}x` : "—", tone: "var(--color-ws-negative)" },
        { label: "Last spend", value: ad.last_spend_date ?? "—" },
        spend,
      ];
    default:
      return [
        spend,
        { label: "Share", value: pct(ad.spend_share) },
        { label: "CPCONV", value: money2(ad.cp_conversation) },
        { label: "Convs", value: count(ad.unique_conversations) },
      ];
  }
}

function CopyRef({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => undefined,
        );
      }}
      title="Copy reference for the learnings log"
      className="text-[10px] truncate transition-colors"
      style={{
        color: copied ? "var(--color-ws-positive)" : "var(--color-ws-text-ghost)",
        fontFamily: "var(--font-data), monospace",
        transitionTimingFunction: "var(--ease-ws)",
      }}
    >
      {copied ? "copied" : value}
    </button>
  );
}

type Props = {
  lens: LensDef;
  rows: CreativeIntelRow[];
  formatLabels: Record<string, string>;
  onOpen: (ad: CreativeIntelRow) => void;
};

export default function LensResults({ lens, rows, formatLabels, onOpen }: Props) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-ws-panel)", border: "1px solid var(--color-ws-hairline)" }}
    >
      <header className="px-4 py-3" style={{ borderBottom: "1px solid var(--color-ws-hairline-soft)" }}>
        <div className="flex items-baseline justify-between gap-3">
          <h3
            className="text-sm"
            style={{ color: lens.accent, fontFamily: "var(--font-display), sans-serif" }}
          >
            {lens.question}
          </h3>
          <span
            className="text-[11px] tabular-nums"
            style={{ color: "var(--color-ws-text-faint)", fontFamily: "var(--font-data), monospace" }}
          >
            {rows.length} {rows.length === 1 ? "ad" : "ads"}
          </span>
        </div>
        <p className="text-[11px] mt-1 max-w-3xl" style={{ color: "var(--color-ws-text-dim)" }}>
          {lens.blurb}
        </p>
      </header>

      {rows.length === 0 ? (
        <Empty>Nothing matches this question in the current window and product filter.</Empty>
      ) : (
        <ul>
          {rows.map((ad) => {
            const thumb = driveThumb(ad.library);
            const evidence = evidenceFor(lens.id, ad);
            return (
              <li
                key={ad.row_key}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(ad)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(ad);
                  }
                }}
                className="px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.02]"
                style={{
                  borderTop: "1px solid var(--color-ws-hairline-soft)",
                  transitionTimingFunction: "var(--ease-ws)",
                }}
              >
                <div className="flex gap-3">
                  {thumb ? (
                    <img src={thumb} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div
                      className="w-11 h-11 rounded-lg flex-shrink-0"
                      style={{
                        background: "var(--color-ws-chrome)",
                        border: "1px solid var(--color-ws-hairline-soft)",
                      }}
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-sm truncate"
                        style={{ color: "var(--color-ws-text-loud)" }}
                      >
                        {ad.ad_name}
                      </span>
                      <Chip color={PRODUCT_COLORS[ad.product]}>{PRODUCT_LABELS[ad.product]}</Chip>
                      {ad.library?.ad_format ? (
                        <Chip>{adFormatLabel(ad.library.ad_format, formatLabels)}</Chip>
                      ) : null}
                      {(ad.library?.tags ?? []).slice(0, 3).map((t) => (
                        <Chip key={t.slug}>{t.label}</Chip>
                      ))}
                      {!ad.is_sourced ? <Chip color="#64748b">Unsourced</Chip> : null}
                      <DiagnosisBadge diagnosis={ad.diagnosis} />
                    </div>

                    <p className="text-[11px] mt-1" style={{ color: "var(--color-ws-text-muted)" }}>
                      {ad.why}
                    </p>

                    {ad.supabase_ref ? (
                      <div className="mt-1">
                        <CopyRef value={ad.supabase_ref} />
                      </div>
                    ) : null}
                  </div>

                  <div className="hidden md:grid grid-cols-4 gap-4 flex-shrink-0 self-start">
                    {evidence.map((ev) => (
                      <div key={ev.label} className="text-right min-w-[72px]">
                        <p
                          className="text-[9px] uppercase tracking-[0.14em]"
                          style={{
                            color: "var(--color-ws-text-faint)",
                            fontFamily: "var(--font-display), sans-serif",
                          }}
                        >
                          {ev.label}
                        </p>
                        <p
                          className="text-sm tabular-nums"
                          style={{
                            color: ev.tone ?? "var(--color-ws-text)",
                            fontFamily: "var(--font-data), monospace",
                          }}
                        >
                          {ev.node ?? ev.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { DIAGNOSIS_COLORS, DIAGNOSIS_LABELS, type AdDiagnosis } from "@/lib/ad-creative-lenses";

/* ── Formatters ────────────────────────────────────────────────────────────── */

export function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString()}`;
}

export function money2(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(dp)}%`;
}

export function count(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString();
}

export function deltaText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${Math.round(v)}%`;
}

/** Prefer a stored thumbnail, else derive one from the Drive file id. */
export function driveThumb(
  entry: { drive_url: string | null; thumbnail_url: string | null } | null | undefined,
): string | null {
  if (!entry) return null;
  if (entry.thumbnail_url) return entry.thumbnail_url;
  const url = entry.drive_url;
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w600` : null;
}

/* ── Primitives ────────────────────────────────────────────────────────────── */

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[10px] uppercase tracking-[0.18em]"
      style={{ color: "var(--color-ws-text-faint)", fontFamily: "var(--font-display), sans-serif" }}
    >
      {children}
    </p>
  );
}

export function Panel({
  title,
  hint,
  actions,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl ${className}`}
      style={{
        background: "var(--color-ws-panel)",
        border: "1px solid var(--color-ws-hairline)",
      }}
    >
      {title ? (
        <header
          className="flex items-start justify-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-ws-hairline-soft)" }}
        >
          <div className="min-w-0">
            <Kicker>{title}</Kicker>
            {hint ? (
              <p className="text-[11px] mt-1" style={{ color: "var(--color-ws-text-dim)" }}>
                {hint}
              </p>
            ) : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs py-10 text-center" style={{ color: "var(--color-ws-text-faint)" }}>
      {children}
    </p>
  );
}

/** Numeric readout. Data font + tabular figures so columns line up. */
export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <Kicker>{label}</Kicker>
      <p
        className="text-lg tabular-nums mt-0.5 truncate"
        style={{ color: tone ?? "var(--color-ws-text-loud)", fontFamily: "var(--font-data), monospace" }}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-[10px] truncate" style={{ color: "var(--color-ws-text-faint)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function DiagnosisBadge({ diagnosis }: { diagnosis: AdDiagnosis }) {
  const color = DIAGNOSIS_COLORS[diagnosis];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] whitespace-nowrap"
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        fontFamily: "var(--font-data), monospace",
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: color }} />
      {DIAGNOSIS_LABELS[diagnosis]}
    </span>
  );
}

/**
 * Signed change. Cost metrics invert — a rising CPCONV is bad — so callers say
 * which direction is good rather than the component guessing from the sign.
 */
export function Delta({
  value,
  goodWhen = "up",
}: {
  value: number | null | undefined;
  goodWhen?: "up" | "down";
}) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span style={{ color: "var(--color-ws-text-faint)", fontFamily: "var(--font-data), monospace" }}>
        —
      </span>
    );
  }
  const good = goodWhen === "up" ? value > 0 : value < 0;
  const flat = Math.abs(value) < 5;
  const color = flat
    ? "var(--color-ws-text-muted)"
    : good
      ? "var(--color-ws-positive)"
      : "var(--color-ws-negative)";
  return (
    <span className="tabular-nums" style={{ color, fontFamily: "var(--font-data), monospace" }}>
      {deltaText(value)}
    </span>
  );
}

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  const c = color ?? "var(--color-ws-text-muted)";
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap"
      style={{
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
        color: c,
        fontFamily: "var(--font-data), monospace",
      }}
    >
      {children}
    </span>
  );
}

"use client";

import type { CSSProperties, ReactNode } from "react";
import { rateColor, thresholdStyle } from "@/lib/acquisition-kpi-thresholds";

/* ── Design tokens (Ethereal Glass) ─────────────────────────────────────── */

export const KPI = {
  font: "var(--font-geist-sans), system-ui, sans-serif",
  fontMono: "var(--font-geist-mono), ui-monospace, monospace",
  bg: "#06080f",
  shell: "rgba(255,255,255,0.04)",
  shellBorder: "rgba(255,255,255,0.08)",
  card: "rgba(12,18,32,0.92)",
  cardInner: "rgba(8,14,28,0.95)",
  text: "#f1f5f9",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  accent: {
    blue: "#60a5fa",
    teal: "#2dd4bf",
    amber: "#fbbf24",
    green: "#4ade80",
    red: "#f87171",
    violet: "#a78bfa",
  },
  ease: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

export const CHART = {
  grid: "rgba(255,255,255,0.06)",
  tick: { fontSize: 12, fill: "#94a3b8", fontFamily: KPI.font },
  tooltip: {
    background: "rgba(10,16,30,0.96)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    fontSize: 13,
    padding: "10px 14px",
    boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
  },
  tooltipLabel: { color: "#cbd5e1", fontWeight: 600, marginBottom: 4 },
} as const;

/* ── Layout primitives ──────────────────────────────────────────────────── */

export function KpiPage({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex flex-col gap-10 pb-14"
      style={{ fontFamily: KPI.font }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(circle, rgba(96,165,250,0.35) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 left-0 h-64 w-64 rounded-full blur-3xl opacity-20"
        style={{ background: "radial-gradient(circle, rgba(45,212,191,0.3) 0%, transparent 70%)" }}
      />
      <div className="relative z-[1] flex flex-col gap-10">{children}</div>
    </div>
  );
}

export function KpiSection({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section>
      <KpiSectionHead title={title} eyebrow={eyebrow} />
      {children}
    </section>
  );
}

export function KpiSectionHead({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      {eyebrow && (
        <span
          className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}
        >
          {eyebrow}
        </span>
      )}
      <h2 className="text-lg font-semibold tracking-tight" style={{ color: KPI.text }}>
        {title}
      </h2>
      <div className="hidden min-w-[40px] flex-1 sm:block" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
    </div>
  );
}

export function KpiBezel({
  children,
  className = "",
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-[1.25rem] p-1.5 ${className}`}
      style={{
        background: KPI.shell,
        border: `1px solid ${KPI.shellBorder}`,
        boxShadow: accent ? `0 0 0 1px ${accent}22, 0 20px 50px rgba(0,0,0,0.25)` : "0 20px 50px rgba(0,0,0,0.2)",
      }}
    >
      <div
        className="h-full rounded-[calc(1.25rem-0.375rem)]"
        style={{
          background: KPI.cardInner,
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.08)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Cards ──────────────────────────────────────────────────────────────── */

export function KpiHeroCard({
  label,
  value,
  sub,
  color = KPI.text,
  accent = KPI.accent.blue,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  accent?: string;
}) {
  return (
    <KpiBezel accent={accent}>
      <div className="relative flex flex-col gap-3 overflow-hidden p-6 sm:p-7">
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
        <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: KPI.textMuted }}>
          {label}
        </span>
        <div
          className="text-[2.5rem] font-bold leading-none tracking-tight sm:text-[2.75rem]"
          style={{ color, fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </div>
        {sub && (
          <p className="text-sm leading-snug" style={{ color: KPI.textDim }}>
            {sub}
          </p>
        )}
      </div>
    </KpiBezel>
  );
}

export function KpiRateCard({
  label,
  value,
  metricKey,
  sub,
  valueStyle,
}: {
  label: string;
  value: string;
  metricKey: string;
  sub?: string;
  valueStyle?: CSSProperties;
}) {
  return (
    <KpiBezel>
      <div className="flex flex-col gap-3 p-5 sm:p-6">
        <span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: KPI.textMuted }}>
          {label}
        </span>
        <div
          className="text-3xl font-bold leading-none tracking-tight sm:text-[2rem]"
          style={{ fontVariantNumeric: "tabular-nums", ...valueStyle }}
        >
          {value}
        </div>
        {sub && (
          <p className="text-sm leading-snug" style={{ color: KPI.textDim }}>
            {sub}
          </p>
        )}
      </div>
    </KpiBezel>
  );
}

export function KpiStatCard({
  label,
  value,
  sub,
  color = KPI.textSecondary,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <KpiBezel>
      <div className="flex flex-col gap-2 p-5 sm:p-6">
        <span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: KPI.textMuted }}>
          {label}
        </span>
        <div className="text-2xl font-bold tracking-tight sm:text-[1.75rem]" style={{ color, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </div>
        {sub && <p className="text-sm" style={{ color: KPI.textDim }}>{sub}</p>}
      </div>
    </KpiBezel>
  );
}

export function KpiDetailCard({
  label,
  value,
  metrics,
  valueColor = KPI.text,
}: {
  label: string;
  value: string;
  valueColor?: string;
  metrics: { label: string; value: string; color?: string }[];
}) {
  return (
    <KpiBezel>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <span className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: KPI.textMuted }}>
          {label}
        </span>
        <div className="text-3xl font-bold tracking-tight" style={{ color: valueColor, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </div>
        <div className="flex flex-wrap gap-5">
          {metrics.map(m => (
            <div key={m.label}>
              <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: KPI.textDim }}>
                {m.label}
              </div>
              <div className="mt-1 text-base font-semibold" style={{ color: m.color ?? KPI.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </KpiBezel>
  );
}

export function KpiChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <KpiBezel>
      <div className="p-5 sm:p-6">
        <h3 className="mb-5 text-base font-semibold" style={{ color: KPI.textSecondary }}>
          {title}
        </h3>
        {children}
      </div>
    </KpiBezel>
  );
}

export function KpiTableShell({ children, empty }: { children: ReactNode; empty?: ReactNode }) {
  return (
    <KpiBezel>
      <div className="overflow-x-auto">
        {empty ?? children}
      </div>
    </KpiBezel>
  );
}

export function KpiLoading({ label = "Loading metrics…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-transparent"
        style={{ borderTopColor: KPI.accent.amber, borderRightColor: "rgba(251,191,36,0.2)" }}
      />
      <p className="text-sm font-medium" style={{ color: KPI.textMuted }}>{label}</p>
    </div>
  );
}

export function KpiEmpty({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-base font-medium" style={{ color: KPI.textMuted }}>{message}</p>
    </div>
  );
}

/* ── Table helpers ──────────────────────────────────────────────────────── */

export const KPI_TH =
  "text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap";
export const KPI_TD = "px-4 py-3.5 text-sm whitespace-nowrap";

export function KpiViewTabs({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: { key: string; label: string }[];
  activeTab: string;
  onTabChange: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="inline-flex gap-1 rounded-full p-1.5"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {tabs.map(tab => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className="rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-all duration-300 active:scale-[0.98]"
              style={
                active
                  ? {
                      background: "rgba(251,191,36,0.16)",
                      color: "#fbbf24",
                      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12), 0 4px 20px rgba(251,191,36,0.12)",
                    }
                  : { color: KPI.textMuted }
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function KpiRatePill({
  value,
  metricKey,
  formatted,
}: {
  value: number | null | undefined;
  metricKey: string;
  formatted?: string;
}) {
  const color = rateColor(metricKey, value ?? null);
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-0.5 text-sm font-semibold"
      style={{
        fontVariantNumeric: "tabular-nums",
        ...thresholdStyle(color),
        background: `${color}18`,
      }}
    >
      {formatted ?? (value == null ? "—" : `${Math.round(value)}%`)}
    </span>
  );
}

import type { ReactNode } from "react";

export const STICKY_TH_BG = "#0a1628";

export function stickyThStyle(bg = STICKY_TH_BG): React.CSSProperties {
  return {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: bg,
    boxShadow: "0 1px 0 rgba(255,255,255,0.06)",
  };
}

export function money(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function daysFromToday(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

export function relativeLabel(dateStr: string | null): string {
  const days = daysFromToday(dateStr);
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${-days} day${days === -1 ? "" : "s"} ago`;
}

export function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fieldStyle() {
  return { background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" } as const;
}

export function LabeledInput({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>{label}</span>
      {children}
    </label>
  );
}

export const BILLING_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  scheduled: { color: "#818cf8", bg: "rgba(129,140,248,0.12)" },
  paid:      { color: "#22c55e", bg: "rgba(34,197,94,0.12)"   },
  partial:   { color: "#38bdf8", bg: "rgba(56,189,248,0.12)"  },
  pending:   { color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  overdue:   { color: "#ef4444", bg: "rgba(239,68,68,0.12)"   },
  failed:    { color: "#ef4444", bg: "rgba(239,68,68,0.12)"   },
  refunded:  { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = BILLING_STATUS_STYLE[status] ?? BILLING_STATUS_STYLE.pending;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: s.color, background: s.bg }}>
      {status}
    </span>
  );
}

"use client";

// Inline lifecycle-status control rendered as a colored pill that doubles as a
// native <select>. Used on roster rows and in the client file header so status
// is changeable in one click. The caller decides what a change means
// (direct patch, feedback modal, or offboard hand-off) via onRequestChange.

export const LIFECYCLE_ORDER = [
  "new_account",
  "onboarding",
  "active",
  "paused",
  "off_boarding",
  "churned",
] as const;

/** Per-lifecycle pill label + accent. Single source of truth for status color. */
export const LIFECYCLE_PILL: Record<string, { label: string; color: string }> = {
  new_account: { label: "New account", color: "#38bdf8" },
  onboarding: { label: "Onboarding", color: "#38bdf8" },
  active: { label: "Active", color: "#22c55e" },
  paused: { label: "Paused", color: "#f59e0b" },
  off_boarding: { label: "Off-boarding", color: "#f59e0b" },
  churned: { label: "Churned", color: "#64748b" },
};

export function lifecyclePill(status: string | null | undefined): { label: string; color: string } {
  const s = status ?? "active";
  return LIFECYCLE_PILL[s] ?? { label: s.replace(/_/g, " "), color: "#94a3b8" };
}

export default function LifecycleStatusSelect({
  value,
  disabled,
  onRequestChange,
  size = "sm",
}: {
  value: string | null | undefined;
  disabled?: boolean;
  onRequestChange: (target: string) => void;
  size?: "sm" | "md";
}) {
  const status = value ?? "active";
  const pill = lifecyclePill(status);
  const pad = size === "md" ? "pl-3 pr-7 py-1 text-sm" : "pl-2 pr-6 py-0.5 text-xs";
  return (
    <span className="relative inline-flex items-center">
      <select
        value={status}
        disabled={disabled}
        onChange={e => {
          if (e.target.value !== status) onRequestChange(e.target.value);
        }}
        className={`appearance-none font-semibold rounded-full cursor-pointer outline-none ${pad}`}
        style={{
          color: pill.color,
          background: `${pill.color}1a`,
          border: `1px solid ${pill.color}40`,
          opacity: disabled ? 0.6 : 1,
        }}
        title="Change lifecycle status"
        aria-label="Lifecycle status"
      >
        {LIFECYCLE_ORDER.map(s => (
          <option key={s} value={s} style={{ background: "#0a1628", color: "#e2e8f0" }}>
            {LIFECYCLE_PILL[s].label}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none absolute ${size === "md" ? "right-2" : "right-1.5"} text-[8px]`}
        style={{ color: pill.color }}
        aria-hidden
      >
        ▼
      </span>
    </span>
  );
}

"use client";

import { useState } from "react";

export type BetOutcomeStatus = "succeeded" | "failed" | "abandoned" | "measuring";

type Props = {
  actionId: string;
  /** Prefill outcome value (live current_value when available). */
  defaultOutcomeValue?: number | null;
  metricUnit?: "money" | "pct" | "ratio" | null;
  onSaved?: () => void;
  onCancel?: () => void;
};

const STATUS_OPTS: { key: BetOutcomeStatus; label: string }[] = [
  { key: "succeeded", label: "Succeeded" },
  { key: "failed", label: "Failed" },
  { key: "measuring", label: "Still measuring" },
  { key: "abandoned", label: "Abandoned" },
];

function formatPrefill(unit: Props["metricUnit"], v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  if (unit === "money") return String(Math.round(v));
  if (unit === "pct") return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 1000) / 1000);
}

export default function BetOutcomeForm({
  actionId,
  defaultOutcomeValue = null,
  metricUnit = null,
  onSaved,
  onCancel,
}: Props) {
  const [status, setStatus] = useState<BetOutcomeStatus>("succeeded");
  const [outcomeValue, setOutcomeValue] = useState(() =>
    formatPrefill(metricUnit, defaultOutcomeValue),
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const parsed =
        outcomeValue.trim() === "" ? null : Number(outcomeValue.replace(/[$,%\s]/g, ""));
      if (outcomeValue.trim() !== "" && !Number.isFinite(parsed)) {
        setError("Outcome value must be a number.");
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/client-actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          outcome_value: parsed,
          outcome_notes: notes.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Failed to record outcome");
        return;
      }
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record outcome");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="mt-3 rounded-lg border p-3 space-y-3"
      style={{
        borderColor: "var(--color-ws-hairline)",
        background: "var(--color-ws-input)",
      }}
    >
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTS.map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setStatus(opt.key)}
            className="text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors"
            style={{
              color:
                status === opt.key
                  ? "var(--color-ws-text-loud)"
                  : "var(--color-ws-text-dim)",
              background:
                status === opt.key
                  ? "var(--color-ws-accent-wash)"
                  : "transparent",
              border: `1px solid ${
                status === opt.key
                  ? "color-mix(in srgb, var(--color-ws-accent) 40%, transparent)"
                  : "var(--color-ws-hairline)"
              }`,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider block mb-1"
            style={{ color: "var(--color-ws-text-faint)" }}
          >
            Outcome value{metricUnit === "money" ? " ($)" : metricUnit === "pct" ? " (%)" : ""}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={outcomeValue}
            onChange={e => setOutcomeValue(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-md px-2.5 py-1.5 text-xs font-data"
            style={{
              background: "var(--color-ws-chrome)",
              border: "1px solid var(--color-ws-hairline)",
              color: "var(--color-ws-text)",
            }}
          />
        </label>
        <label className="block sm:col-span-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider block mb-1"
            style={{ color: "var(--color-ws-text-faint)" }}
          >
            Notes
          </span>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="What happened?"
            className="w-full rounded-md px-2.5 py-1.5 text-xs"
            style={{
              background: "var(--color-ws-chrome)",
              border: "1px solid var(--color-ws-hairline)",
              color: "var(--color-ws-text)",
            }}
          />
        </label>
      </div>
      {error && (
        <p className="text-[11px]" style={{ color: "var(--color-ws-negative)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50"
          style={{
            background: "var(--color-ws-accent)",
            color: "#0a1628",
          }}
        >
          {saving ? "Saving…" : "Save outcome"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-2 py-1.5"
            style={{ color: "var(--color-ws-text-dim)" }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

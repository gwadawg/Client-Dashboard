"use client";

import { useEffect, useState } from "react";
import {
  LIFECYCLE_REASON_OPTIONS,
  lifecycleStatusLabel,
  requiresReasonOnChurn,
} from "@/lib/client-feedback";

type Props = {
  open: boolean;
  clientName: string;
  targetStatus: string;
  saving?: boolean;
  onConfirm: (reason: string | null, note: string) => void;
  onCancel: () => void;
};

const fieldStyle = {
  background: "#050c18",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  outline: "none",
  width: "100%",
} as const;

export default function StatusChangeModal({
  open,
  clientName,
  targetStatus,
  saving = false,
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const reasonRequired = requiresReasonOnChurn(targetStatus);

  useEffect(() => {
    if (open) {
      setReason("");
      setNote("");
    }
  }, [open, targetStatus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onCancel]);

  if (!open) return null;

  const canSubmit = !saving && (!reasonRequired || reason !== "");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ background: "rgba(2,6,15,0.75)" }}
      onClick={() => { if (!saving) onCancel(); }}
    >
      <div
        className="w-full max-w-md rounded-xl p-5"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
          Mark as {lifecycleStatusLabel(targetStatus)}
        </h3>
        <p className="text-sm mt-1" style={{ color: "#64748b" }}>
          {clientName} — capture why for future analysis.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
              Reason{reasonRequired ? " *" : " (optional)"}
            </span>
            <select
              value={reason}
              disabled={saving}
              onChange={e => setReason(e.target.value)}
              className="mt-1 cursor-pointer"
              style={fieldStyle}
            >
              <option value="">{reasonRequired ? "Select a reason…" : "No reason selected"}</option>
              {LIFECYCLE_REASON_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
              Details (optional)
            </span>
            <textarea
              value={note}
              disabled={saving}
              onChange={e => setNote(e.target.value)}
              rows={4}
              placeholder="Context, quotes, next steps, or lessons learned…"
              className="mt-1 resize-y"
              style={fieldStyle}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason || null, note.trim())}
            disabled={!canSubmit}
            className="text-xs font-semibold px-3 py-2 rounded-lg"
            style={{
              color: targetStatus === "churned" ? "#ef4444" : "#f59e0b",
              background: targetStatus === "churned" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
              border: `1px solid ${targetStatus === "churned" ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)"}`,
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

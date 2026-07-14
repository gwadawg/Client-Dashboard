"use client";

import { useState } from "react";
import {
  DIAL_EXAMPLE_GRADE_OPTIONS,
  DIAL_EXAMPLE_LEAD_TYPE_OPTIONS,
  type DialExampleGrade,
  type DialExampleLeadType,
} from "@/lib/dial-examples";
import {
  dialExampleDraftToApiBody,
  draftFromCallCenterRecording,
  validateDialExampleDraft,
  type DialExampleDraft,
} from "@/lib/dial-example-draft";

export type CallCenterRecordingRow = {
  id: string;
  occurred_at: string;
  lead_name: string | null;
  lead_phone: string | null;
  agent_name: string | null;
  duration_seconds: number | null;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
  call_status: string | null;
  recording_url: string;
  clients: { name: string } | null;
  client_id?: string | null;
};

type Props = {
  row: CallCenterRecordingRow;
  onClose: () => void;
  onSaved: () => void;
};

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
} as const;

function fmtDuration(s: number | null) {
  if (s == null || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function SaveDialExampleModal({ row, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<DialExampleDraft>(() => draftFromCallCenterRecording(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof DialExampleDraft>(key: K, value: DialExampleDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  async function save() {
    const validation = validateDialExampleDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError(null);

    const res = await fetch("/api/dial-examples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dialExampleDraftToApiBody(draft)),
    });
    const d = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(d.error ?? "Failed to save example");
      return;
    }

    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 space-y-4"
        style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold" style={{ color: "#f1f5f9" }}>Save dial example</h2>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            Add this call-rep recording to the examples library for coaching.
          </p>
        </div>

        <div
          className="rounded-xl px-3 py-2.5 space-y-1"
          style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
            {row.lead_name ?? "Unknown lead"}
            {row.clients?.name ? (
              <span style={{ color: "#64748b" }}> · {row.clients.name}</span>
            ) : null}
          </p>
          <p className="text-xs" style={{ color: "#64748b" }}>
            {new Date(row.occurred_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {" · "}
            {fmtDuration(row.duration_seconds)}
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Rep on the call
          </span>
          <input
            type="text"
            readOnly
            value={draft.agent_name || "Unknown"}
            style={{ ...fieldStyle, opacity: 0.85, cursor: "default" }}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Lead type
          </span>
          <div className="grid grid-cols-3 gap-2">
            {DIAL_EXAMPLE_LEAD_TYPE_OPTIONS.map(o => {
              const selected = draft.lead_type === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={saving}
                  onClick={() => patch("lead_type", o.value as DialExampleLeadType)}
                  className="text-sm font-semibold py-2 rounded-lg"
                  style={{
                    color: selected ? "#f59e0b" : "#94a3b8",
                    background: selected ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selected ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  {o.value}
                </button>
              );
            })}
          </div>
        </label>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Grade
          </span>
          <div className="grid grid-cols-4 gap-2">
            {DIAL_EXAMPLE_GRADE_OPTIONS.map(o => {
              const selected = draft.grade === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={saving}
                  onClick={() => patch("grade", o.value as DialExampleGrade)}
                  className="text-sm font-semibold py-2 rounded-lg"
                  style={{
                    color: selected ? "#34d399" : "#94a3b8",
                    background: selected ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selected ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.1)"}`,
                  }}
                  title={o.label}
                >
                  {o.value}
                </button>
              );
            })}
          </div>
        </label>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Title
          </span>
          <input
            type="text"
            disabled={saving}
            value={draft.title}
            onChange={e => patch("title", e.target.value)}
            style={fieldStyle}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Notes <span style={{ color: "#334155", fontWeight: 500 }}>(optional)</span>
          </span>
          <textarea
            disabled={saving}
            value={draft.summary}
            onChange={e => patch("summary", e.target.value)}
            placeholder="Why this call is a good example…"
            rows={2}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </label>

        {error && <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="text-sm font-medium px-4 py-2 rounded-lg"
            style={{ color: "#94a3b8", background: "rgba(255,255,255,0.04)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="text-sm font-semibold px-4 py-2 rounded-lg"
            style={{ color: "#0f172a", background: "#f59e0b", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Save example"}
          </button>
        </div>
      </div>
    </div>
  );
}

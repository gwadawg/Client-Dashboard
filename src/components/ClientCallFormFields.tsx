"use client";

import CheckinCallFormFields from "@/components/CheckinCallFormFields";
import { CALL_TYPE_OPTIONS } from "@/lib/client-calls";
import type { ClientCallDraft } from "@/lib/client-call-draft";

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

type ClientOption = { id: string; name: string };

export default function ClientCallFormFields({
  draft,
  onChange,
  disabled = false,
  clients,
  showClientSelect = false,
}: {
  draft: ClientCallDraft;
  onChange: (draft: ClientCallDraft) => void;
  disabled?: boolean;
  clients?: ClientOption[];
  showClientSelect?: boolean;
}) {
  function patch<K extends keyof ClientCallDraft>(key: K, value: ClientCallDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div className="space-y-3">
      {showClientSelect && clients && (
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Client <span style={{ color: "#f59e0b" }}>*</span>
          </span>
          <select
            value={draft.client_id}
            disabled={disabled}
            onChange={e => patch("client_id", e.target.value)}
            className="mt-1 cursor-pointer"
            style={{
              ...fieldStyle,
              border: !draft.client_id ? "1px solid rgba(245,158,11,0.45)" : fieldStyle.border,
            }}
          >
            <option value="">Select client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Call type</span>
          <select
            value={draft.call_type}
            disabled={disabled}
            onChange={e => patch("call_type", e.target.value)}
            className="mt-1 cursor-pointer"
            style={fieldStyle}
          >
            {CALL_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Call date</span>
          <input
            type="datetime-local"
            value={draft.called_at}
            disabled={disabled}
            onChange={e => patch("called_at", e.target.value)}
            className="mt-1"
            style={fieldStyle}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Recording URL</span>
        <input
          type="url"
          value={draft.recording_url}
          disabled={disabled}
          onChange={e => patch("recording_url", e.target.value)}
          placeholder="https://…"
          className="mt-1"
          style={fieldStyle}
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Attendees (optional)</span>
        <input
          value={draft.attendees}
          disabled={disabled}
          onChange={e => patch("attendees", e.target.value)}
          placeholder="Sarah (CS), John (client)"
          className="mt-1"
          style={fieldStyle}
        />
      </label>

      {draft.call_type === "checkin" && (
        <CheckinCallFormFields
          value={draft.checkin_form}
          disabled={disabled}
          onChange={checkin_form => patch("checkin_form", checkin_form)}
        />
      )}

      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Transcript</span>
        <textarea
          value={draft.transcript}
          disabled={disabled}
          onChange={e => patch("transcript", e.target.value)}
          rows={5}
          placeholder="Paste call transcript…"
          className="mt-1 resize-y"
          style={fieldStyle}
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Notes</span>
        <textarea
          value={draft.notes}
          disabled={disabled}
          onChange={e => patch("notes", e.target.value)}
          rows={3}
          placeholder={draft.call_type === "checkin" ? "Optional — auto-filled from check-in form if left blank" : "Summary, action items, follow-ups…"}
          className="mt-1 resize-y"
          style={fieldStyle}
        />
      </label>
    </div>
  );
}

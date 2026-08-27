"use client";

import ActionItemList from "@/components/ActionItemList";
import CallAnalysisFields from "@/components/CallAnalysisFields";
import CallLogSectionChips from "@/components/CallLogSectionChips";
import CheckinCallFormFields from "@/components/CheckinCallFormFields";
import { CALL_TYPE_OPTIONS } from "@/lib/client-calls";
import {
  applyCallTypeToDraft,
  toggleDraftSection,
  type ClientCallDraft,
} from "@/lib/client-call-draft";
import type { CallLogDraft, CallLogSectionId } from "@/lib/call-log-form";

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

function sectionOn(draft: ClientCallDraft, id: CallLogSectionId) {
  return draft.log.sections.includes(id);
}

function patchLog<K extends keyof CallLogDraft>(
  draft: ClientCallDraft,
  key: K,
  value: CallLogDraft[K],
): ClientCallDraft {
  return { ...draft, log: { ...draft.log, [key]: value } };
}

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

  const linkMissing = !draft.recording_url.trim();
  const clientMissing = showClientSelect && !draft.client_id;

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
              border: clientMissing ? "1px solid rgba(245,158,11,0.45)" : fieldStyle.border,
            }}
          >
            <option value="">Select client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
          Call / recording link <span style={{ color: "#f59e0b" }}>*</span>
        </span>
        <input
          type="url"
          value={draft.recording_url}
          disabled={disabled}
          onChange={e => patch("recording_url", e.target.value)}
          placeholder="https://…"
          className="mt-1"
          style={{
            ...fieldStyle,
            border: linkMissing ? "1px solid rgba(245,158,11,0.45)" : fieldStyle.border,
          }}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Call type
          </span>
          <select
            value={draft.call_type}
            disabled={disabled}
            onChange={e => onChange(applyCallTypeToDraft(draft, e.target.value))}
            className="mt-1 cursor-pointer"
            style={fieldStyle}
          >
            {CALL_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Call date
          </span>
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
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
          Notes
        </span>
        <textarea
          value={draft.notes}
          disabled={disabled}
          onChange={e => patch("notes", e.target.value)}
          rows={2}
          placeholder="Optional one-liner catch-all…"
          className="mt-1 resize-y"
          style={fieldStyle}
        />
      </label>

      <CallLogSectionChips
        sections={draft.log.sections}
        disabled={disabled}
        onToggle={id => onChange(toggleDraftSection(draft, id))}
      />

      {sectionOn(draft, "key_points") && (
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Key points
          </span>
          <textarea
            value={draft.log.key_points}
            disabled={disabled}
            onChange={e => onChange(patchLog(draft, "key_points", e.target.value))}
            rows={3}
            placeholder="Main discoveries / what you spoke about…"
            className="mt-1 resize-y"
            style={fieldStyle}
          />
        </label>
      )}

      {sectionOn(draft, "action_items") && (
        <ActionItemList
          items={draft.log.action_items}
          disabled={disabled}
          onChange={action_items => onChange(patchLog(draft, "action_items", action_items))}
        />
      )}

      {sectionOn(draft, "call_analysis") && (
        <CallAnalysisFields
          value={draft.log.call_analysis}
          disabled={disabled}
          onChange={call_analysis => onChange(patchLog(draft, "call_analysis", call_analysis))}
        />
      )}

      {sectionOn(draft, "health") && (
        <CheckinCallFormFields
          value={draft.log.health}
          disabled={disabled}
          onChange={health => onChange(patchLog(draft, "health", health))}
        />
      )}

      {sectionOn(draft, "wins") && (
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Wins
          </span>
          <textarea
            value={draft.log.wins}
            disabled={disabled}
            onChange={e => onChange(patchLog(draft, "wins", e.target.value))}
            rows={2}
            placeholder="Positives that came up…"
            className="mt-1 resize-y"
            style={fieldStyle}
          />
        </label>
      )}

      {sectionOn(draft, "concerns") && (
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Concerns
          </span>
          <textarea
            value={draft.log.concerns}
            disabled={disabled}
            onChange={e => onChange(patchLog(draft, "concerns", e.target.value))}
            rows={2}
            placeholder="Issues, risks, friction…"
            className="mt-1 resize-y"
            style={fieldStyle}
          />
        </label>
      )}

      {sectionOn(draft, "transcript") && (
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Transcript
          </span>
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
      )}

      {sectionOn(draft, "attendees") && (
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>
            Attendees
          </span>
          <input
            value={draft.attendees}
            disabled={disabled}
            onChange={e => patch("attendees", e.target.value)}
            placeholder="Sarah (CS), John (client)"
            className="mt-1"
            style={fieldStyle}
          />
        </label>
      )}
    </div>
  );
}

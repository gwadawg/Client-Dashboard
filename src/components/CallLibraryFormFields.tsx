"use client";

import CallHighlightEditor from "@/components/CallHighlightEditor";
import { TEAM_CALL_TYPE_OPTIONS } from "@/lib/team-calls";
import type { TeamCallDraft } from "@/lib/team-call-draft";

type Props = {
  draft: TeamCallDraft;
  onChange: (draft: TeamCallDraft) => void;
  disabled?: boolean;
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

export default function CallLibraryFormFields({ draft, onChange, disabled }: Props) {
  function patch<K extends keyof TeamCallDraft>(key: K, value: TeamCallDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Title</span>
        <input
          type="text"
          disabled={disabled}
          value={draft.title}
          onChange={e => patch("title", e.target.value)}
          placeholder="e.g. Setter coaching — budget objections"
          style={fieldStyle}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Call type</span>
          <select
            disabled={disabled}
            value={draft.call_type}
            onChange={e => patch("call_type", e.target.value)}
            style={fieldStyle}
          >
            {TEAM_CALL_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Date & time</span>
          <input
            type="datetime-local"
            disabled={disabled}
            value={draft.called_at}
            onChange={e => patch("called_at", e.target.value)}
            style={fieldStyle}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Participants</span>
        <input
          type="text"
          disabled={disabled}
          value={draft.participants}
          onChange={e => patch("participants", e.target.value)}
          placeholder="Sarah, Mike, Jordan"
          style={fieldStyle}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Recording URL</span>
          <input
            type="url"
            disabled={disabled}
            value={draft.recording_url}
            onChange={e => patch("recording_url", e.target.value)}
            placeholder="https://…"
            style={fieldStyle}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Duration (minutes)</span>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={draft.duration_minutes}
            onChange={e => patch("duration_minutes", e.target.value)}
            placeholder="45"
            style={fieldStyle}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Tags</span>
        <input
          type="text"
          disabled={disabled}
          value={draft.tags}
          onChange={e => patch("tags", e.target.value)}
          placeholder="objections, setter, role-play (comma-separated)"
          style={fieldStyle}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Summary</span>
        <textarea
          disabled={disabled}
          value={draft.summary}
          onChange={e => patch("summary", e.target.value)}
          placeholder="Context and overall takeaways from this call…"
          rows={3}
          style={{ ...fieldStyle, resize: "vertical" }}
        />
      </label>

      <CallHighlightEditor
        highlights={draft.highlights}
        onChange={highlights => patch("highlights", highlights)}
        disabled={disabled}
      />

      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Transcript</span>
        <textarea
          disabled={disabled}
          value={draft.transcript}
          onChange={e => patch("transcript", e.target.value)}
          placeholder="Paste the full call transcript…"
          rows={8}
          style={{ ...fieldStyle, resize: "vertical" }}
        />
      </label>
    </div>
  );
}

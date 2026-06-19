"use client";

import { LIFECYCLE_REASON_OPTIONS } from "@/lib/client-feedback";
import {
  CHURN_CHECKLIST_ITEMS,
  WOULD_REJOIN_OPTIONS,
  churnReasonDisplay,
  isChurnChecklistItemSatisfied,
  type ChurnChecklistKey,
  type ChurnFormDraft,
} from "@/lib/churn-form";

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
} as const;

type Props = {
  draft: ChurnFormDraft;
  setDraft: React.Dispatch<React.SetStateAction<ChurnFormDraft>>;
  patchChecklist: (key: ChurnChecklistKey, completed: boolean) => void;
  patchChecklistException: (key: ChurnChecklistKey, explanation: string) => void;
  alreadyChurned: boolean;
  existingSubmission: { submitted_at: string; responses: Record<string, unknown> } | null;
  saveError: string | null;
  saving: boolean;
  onSubmit: () => void;
  submitLabel?: string;
};

export default function ChurnOffboardingFormFields({
  draft,
  setDraft,
  patchChecklist,
  patchChecklistException,
  alreadyChurned,
  existingSubmission,
  saveError,
  saving,
  onSubmit,
  submitLabel = "Mark client as churned",
}: Props) {
  const existingReason =
    existingSubmission?.responses?.reason_code != null
      ? churnReasonDisplay(String(existingSubmission.responses.reason_code))
      : null;

  if (alreadyChurned) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-amber-300 rounded-lg px-4 py-3 bg-amber-950/40 border border-amber-500/30">
          This client is already marked as churned. Offboarding cannot be submitted again.
        </p>
        {existingSubmission && (
          <div className="text-sm text-slate-400 space-y-1 rounded-lg px-4 py-3 bg-white/5 border border-white/10">
            <p>Submitted: {new Date(existingSubmission.submitted_at).toLocaleString()}</p>
            {existingReason && <p>Reason: {existingReason}</p>}
            {typeof existingSubmission.responses.client_feedback === "string" && (
              <p className="mt-2 text-slate-300">{existingSubmission.responses.client_feedback}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-400">Churn reason *</span>
        <select
          value={draft.reason_code}
          onChange={e => setDraft(prev => ({ ...prev, reason_code: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
          style={fieldStyle}
        >
          <option value="">Select a reason…</option>
          {LIFECYCLE_REASON_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-400">Effective churn date *</span>
        <input
          type="date"
          value={draft.effective_churn_date}
          onChange={e => setDraft(prev => ({ ...prev, effective_churn_date: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={fieldStyle}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-400">Client feedback *</span>
        <textarea
          value={draft.client_feedback}
          onChange={e => setDraft(prev => ({ ...prev, client_feedback: e.target.value }))}
          rows={4}
          placeholder="What did the client say about why they're leaving? Capture quotes and context."
          className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
          style={fieldStyle}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-400">Internal notes (optional)</span>
        <textarea
          value={draft.internal_notes}
          onChange={e => setDraft(prev => ({ ...prev, internal_notes: e.target.value }))}
          rows={2}
          placeholder="Lessons learned, product feedback, or context for the team."
          className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
          style={fieldStyle}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-400">Exit call recording URL (optional)</span>
        <input
          type="url"
          value={draft.recording_url}
          onChange={e => setDraft(prev => ({ ...prev, recording_url: e.target.value }))}
          placeholder="https://…"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={fieldStyle}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-400">Exit call transcript (optional)</span>
        <textarea
          value={draft.transcript}
          onChange={e => setDraft(prev => ({ ...prev, transcript: e.target.value }))}
          rows={5}
          placeholder="Paste the full exit call transcript…"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
          style={fieldStyle}
        />
        <p className="text-xs text-slate-500">Saved on the churn call in Client Calls for search and review.</p>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-400">Would they rejoin? (optional)</span>
        <select
          value={draft.would_rejoin}
          onChange={e => setDraft(prev => ({ ...prev, would_rejoin: e.target.value as ChurnFormDraft["would_rejoin"] }))}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
          style={fieldStyle}
        >
          {WOULD_REJOIN_OPTIONS.map(o => (
            <option key={o.value || "none"} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <div className="space-y-3 pt-2">
        <div>
          <p className="text-sm font-medium text-slate-400">Offboarding checklist *</p>
          <p className="text-xs mt-0.5 text-slate-500">
            Answer yes or no for each item. If no, explain why so the form can still be submitted.
          </p>
        </div>
        {CHURN_CHECKLIST_ITEMS.map(item => (
          <ChurnChecklistItemRow
            key={item.key}
            item={item}
            draft={draft}
            onSelect={completed => patchChecklist(item.key, completed)}
            onExceptionChange={explanation => patchChecklistException(item.key, explanation)}
          />
        ))}
      </div>

      {saveError && (
        <p className="text-sm rounded-lg px-4 py-3 text-red-400 bg-red-950/40 border border-red-500/30">{saveError}</p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={saving}
        className="w-full text-sm font-semibold px-4 py-3 rounded-lg text-white"
        style={{ background: saving ? "#334155" : "#dc2626" }}
      >
        {saving ? "Submitting…" : submitLabel}
      </button>
    </div>
  );
}

function ChurnChecklistItemRow({
  item,
  draft,
  onSelect,
  onExceptionChange,
}: {
  item: (typeof CHURN_CHECKLIST_ITEMS)[number];
  draft: ChurnFormDraft;
  onSelect: (completed: boolean) => void;
  onExceptionChange: (explanation: string) => void;
}) {
  const answered = draft.checklist_answered[item.key];
  const completed = draft.checklist[item.key];
  const satisfied = isChurnChecklistItemSatisfied(draft, item.key);
  const showExplanation = answered && !completed;

  return (
    <div
      className="rounded-lg px-3 py-3 space-y-2"
      style={{
        background: satisfied ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
        border: satisfied ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="text-sm text-slate-200">{item.label}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(true)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: answered && completed ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)",
            color: answered && completed ? "#86efac" : "#94a3b8",
            border: answered && completed ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.1)",
          }}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onSelect(false)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: answered && !completed ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.05)",
            color: answered && !completed ? "#fcd34d" : "#94a3b8",
            border: answered && !completed ? "1px solid rgba(245,158,11,0.35)" : "1px solid rgba(255,255,255,0.1)",
          }}
        >
          No
        </button>
      </div>
      {showExplanation && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Why wasn&apos;t this completed? *</span>
          <textarea
            value={draft.checklist_exceptions[item.key]}
            onChange={e => onExceptionChange(e.target.value)}
            rows={2}
            placeholder="Brief explanation (e.g. client never ran Meta ads, billing handled by partner, etc.)"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
            style={fieldStyle}
          />
        </label>
      )}
    </div>
  );
}

"use client";

import { LIFECYCLE_REASON_OPTIONS } from "@/lib/client-feedback";
import {
  CHURN_CHECKLIST_ITEMS,
  WOULD_REJOIN_OPTIONS,
  churnReasonDisplay,
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
  patchChecklist: (key: keyof ChurnFormDraft["checklist"], checked: boolean) => void;
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

      <div className="space-y-2 pt-2">
        <p className="text-sm font-medium text-slate-400">Offboarding checklist *</p>
        {CHURN_CHECKLIST_ITEMS.map(item => (
          <label key={item.key} className="flex items-start gap-3 cursor-pointer rounded-lg px-3 py-2 hover:bg-white/5">
            <input
              type="checkbox"
              checked={draft.checklist[item.key]}
              onChange={e => patchChecklist(item.key, e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm text-slate-200">{item.label}</span>
          </label>
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

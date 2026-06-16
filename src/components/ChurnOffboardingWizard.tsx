"use client";

import ChurnOffboardingFormFields from "@/components/ChurnOffboardingFormFields";
import { useChurnOffboarding } from "@/hooks/useChurnOffboarding";

type Props = {
  clientId: string;
  fallbackName: string;
  onClose: () => void;
  onCompleted?: () => void;
};

/** Modal shortcut — opens the same offboarding form for a known client. */
export default function ChurnOffboardingWizard({ clientId, fallbackName, onClose, onCompleted }: Props) {
  const {
    loading,
    saving,
    error,
    saveError,
    clientName,
    alreadyChurned,
    existingSubmission,
    draft,
    setDraft,
    patchChecklist,
    submit,
  } = useChurnOffboarding(clientId);

  async function handleSubmit() {
    const ok = await submit();
    if (ok) {
      onCompleted?.();
      onClose();
    }
  }

  const displayName = clientName || fallbackName;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-6 px-4"
      style={{ background: "rgba(2,6,15,0.85)" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-xl shadow-2xl overflow-hidden"
        style={{ maxWidth: 600, background: "#060d1a", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-start justify-between gap-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <h2 className="text-lg font-semibold text-slate-200">Churn Offboarding</h2>
            <p className="text-sm mt-0.5 text-slate-500">
              {displayName} — capture exit feedback and sync churn across systems.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-400 border border-white/10">
            Close
          </button>
        </div>

        <div className="px-6 py-6">
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-8">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-400 text-center py-8">{error}</p>
          ) : (
            <ChurnOffboardingFormFields
              draft={draft}
              setDraft={setDraft}
              patchChecklist={patchChecklist}
              alreadyChurned={alreadyChurned}
              existingSubmission={existingSubmission}
              saveError={saveError}
              saving={saving}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

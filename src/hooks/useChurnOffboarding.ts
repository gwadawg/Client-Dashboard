"use client";

import { useCallback, useEffect, useState } from "react";
import {
  emptyChurnDraft,
  isChurnFormComplete,
  type ChurnFormDraft,
} from "@/lib/churn-form";

type ExistingSubmission = {
  submitted_at: string;
  responses: Record<string, unknown>;
};

export function useChurnOffboarding(clientId: string | null) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [alreadyChurned, setAlreadyChurned] = useState(false);
  const [existingSubmission, setExistingSubmission] = useState<ExistingSubmission | null>(null);
  const [draft, setDraft] = useState<ChurnFormDraft>(emptyChurnDraft());
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      setError(null);
      setSaveError(null);
      setClientName("");
      setAlreadyChurned(false);
      setExistingSubmission(null);
      setDraft(emptyChurnDraft());
      setSuccess(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveError(null);
    setSuccess(false);

    (async () => {
      const res = await fetch(`/api/clients/${clientId}/churn`);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? "Failed to load offboarding form");
        setLoading(false);
        return;
      }
      setClientName(data.client?.name ?? "");
      setAlreadyChurned(!!data.already_churned);
      setExistingSubmission(data.existing_submission ?? null);
      setDraft(emptyChurnDraft(data.default_effective_date ?? ""));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [clientId]);

  const patchChecklist = useCallback((key: keyof ChurnFormDraft["checklist"], checked: boolean) => {
    setDraft(prev => ({
      ...prev,
      checklist: { ...prev.checklist, [key]: checked },
    }));
    setSaveError(null);
  }, []);

  const submit = useCallback(async (): Promise<boolean> => {
    if (!clientId) return false;
    if (!isChurnFormComplete(draft)) {
      setSaveError("Complete all required fields and checklist items.");
      return false;
    }
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}/churn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setSaveError(data.error ?? "Failed to complete offboarding");
      return false;
    }
    setSuccess(true);
    setAlreadyChurned(true);
    return true;
  }, [clientId, draft]);

  const resetAfterSuccess = useCallback(() => {
    setSuccess(false);
    setDraft(emptyChurnDraft());
    setExistingSubmission(null);
  }, []);

  return {
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
    success,
    resetAfterSuccess,
  };
}

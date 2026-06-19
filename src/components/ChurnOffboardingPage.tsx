"use client";

import { useEffect, useMemo, useState } from "react";
import ChurnOffboardingFormFields from "@/components/ChurnOffboardingFormFields";
import { useChurnOffboarding } from "@/hooks/useChurnOffboarding";
import { isChurnOffboardEligible } from "@/lib/internal-forms";

type OffboardClient = {
  id: string;
  name: string;
  lifecycle_status: string | null;
  primary_contact_name: string | null;
  primary_contact: string | null;
  email: string | null;
  billing_email: string | null;
};

function clientLabel(c: OffboardClient): string {
  const contact = c.primary_contact_name || c.primary_contact;
  const email = c.email || c.billing_email;
  const parts = [c.name];
  if (contact && contact !== c.name) parts.push(contact);
  if (email) parts.push(email);
  return parts.join(" · ");
}

function lifecycleLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return status.replace(/_/g, " ");
}

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
} as const;

type Props = {
  initialClientId?: string | null;
  onClientIdChange?: (clientId: string | null) => void;
  onCompleted?: () => void;
};

export default function ChurnOffboardingPage({
  initialClientId = null,
  onClientIdChange,
  onCompleted,
}: Props) {
  const [clients, setClients] = useState<OffboardClient[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId);

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
    patchChecklistException,
    submit,
    success,
    resetAfterSuccess,
  } = useChurnOffboarding(selectedClientId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/clients?detail=1");
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setListError(data.error ?? "Failed to load clients");
        setListLoading(false);
        return;
      }
      setClients(data.clients ?? []);
      setListLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (initialClientId) setSelectedClientId(initialClientId);
  }, [initialClientId]);

  const eligibleClients = useMemo(
    () => clients.filter(c => isChurnOffboardEligible(c.lifecycle_status)),
    [clients],
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligibleClients;
    return eligibleClients.filter(c => {
      const haystack = [
        c.name,
        c.primary_contact_name,
        c.primary_contact,
        c.email,
        c.billing_email,
        c.lifecycle_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [eligibleClients, search]);

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  function selectClient(id: string | null) {
    setSelectedClientId(id);
    onClientIdChange?.(id);
    if (!id) resetAfterSuccess();
  }

  async function handleSubmit() {
    const ok = await submit();
    if (!ok) return;
    onCompleted?.();
    const res = await fetch("/api/clients?detail=1");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setClients(data.clients ?? []);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-200">Churn Offboarding</h2>
        <p className="text-sm mt-1 text-slate-500">
          Select the client who is leaving, capture exit feedback, and sync churn across Mr. Waiz, ClickUp, and GHL.
        </p>
      </div>

      <section
        className="rounded-xl p-5 space-y-4"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div>
          <p className="text-sm font-semibold text-slate-200">1. Select client</p>
          <p className="text-xs mt-0.5 text-slate-500">Search by sub-account name, contact, or email.</p>
        </div>

        {listLoading ? (
          <p className="text-sm text-slate-500">Loading clients…</p>
        ) : listError ? (
          <p className="text-sm text-red-400">{listError}</p>
        ) : (
          <>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={fieldStyle}
            />
            <select
              value={selectedClientId ?? ""}
              onChange={e => selectClient(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
              style={fieldStyle}
            >
              <option value="">Choose a client…</option>
              {filteredClients.map(c => (
                <option key={c.id} value={c.id}>
                  {clientLabel(c)} ({lifecycleLabel(c.lifecycle_status)})
                </option>
              ))}
            </select>
            {search && filteredClients.length === 0 && (
              <p className="text-xs text-slate-500">No eligible clients match your search.</p>
            )}
            {selectedClient && (
              <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-white/5 border border-white/10">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{selectedClient.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {(selectedClient.primary_contact_name || selectedClient.primary_contact) ?? "—"}
                    {" · "}
                    {lifecycleLabel(selectedClient.lifecycle_status)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => selectClient(null)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-200 shrink-0"
                >
                  Change
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {selectedClientId && (
        <section
          className="rounded-xl p-5 space-y-4"
          style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div>
            <p className="text-sm font-semibold text-slate-200">2. Offboarding details</p>
            <p className="text-xs mt-0.5 text-slate-500">
              {clientName || selectedClient?.name} — complete every required field before submitting.
            </p>
          </div>

          {success && (
            <p className="text-sm text-green-300 rounded-lg px-4 py-3 bg-green-950/40 border border-green-500/30">
              Offboarding submitted. {clientName || selectedClient?.name} is now marked as churned.
            </p>
          )}

          {loading ? (
            <p className="text-sm text-slate-500 text-center py-8">Loading form…</p>
          ) : error ? (
            <p className="text-sm text-red-400 text-center py-8">{error}</p>
          ) : (
            <ChurnOffboardingFormFields
              draft={draft}
              setDraft={setDraft}
              patchChecklist={patchChecklist}
              patchChecklistException={patchChecklistException}
              alreadyChurned={alreadyChurned}
              existingSubmission={existingSubmission}
              saveError={saveError}
              saving={saving}
              onSubmit={handleSubmit}
            />
          )}
        </section>
      )}

      {!selectedClientId && !listLoading && (
        <p className="text-sm text-center py-8 text-slate-500">
          Select a client above to begin the offboarding form.
        </p>
      )}
    </div>
  );
}

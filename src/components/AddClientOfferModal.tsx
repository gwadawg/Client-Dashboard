"use client";

import { useEffect, useMemo, useState } from "react";
import { REPORTING_TYPE_META, REPORTING_TYPES } from "@/lib/reporting-types";
import { normalizeReportingType } from "@/lib/kpi-layouts";

export type AddClientOfferResult = {
  id: string;
  name: string;
};

type Draft = {
  name: string;
  reporting_type: string;
  ghl_location_id: string;
  mrr: string;
  lifecycle_status: string;
};

function offerSuffix(reportingType: string): string {
  const rt = normalizeReportingType(reportingType);
  if (rt === "CALL_CENTER") return "Call Center";
  return REPORTING_TYPE_META[rt]?.shortLabel ?? rt;
}

function suggestSubaccountName(accountName: string, reportingType: string): string {
  const base = accountName.trim();
  const suffix = offerSuffix(reportingType);
  if (!base) return suffix;
  if (base.toLowerCase().includes(suffix.toLowerCase())) return base;
  return `${base} - ${suffix}`;
}

function defaultReportingType(existing: string[]): string {
  const used = new Set(existing.map(t => normalizeReportingType(t)));
  const preferred = ["DSCR", "RM", "CALL_CENTER"] as const;
  for (const rt of preferred) {
    if (!used.has(rt)) return rt;
  }
  return "DSCR";
}

export default function AddClientOfferModal({
  originClientId,
  accountDisplayName,
  existingReportingTypes = [],
  canViewRevenue,
  onClose,
  onCreated,
}: {
  originClientId: string;
  accountDisplayName: string;
  existingReportingTypes?: string[];
  canViewRevenue: boolean;
  onClose: () => void;
  onCreated: (client: AddClientOfferResult) => void;
}) {
  const initialType = useMemo(
    () => defaultReportingType(existingReportingTypes),
    [existingReportingTypes],
  );

  const [draft, setDraft] = useState<Draft>(() => ({
    name: suggestSubaccountName(accountDisplayName, initialType),
    reporting_type: initialType,
    ghl_location_id: "",
    mrr: "",
    lifecycle_status: "new_account",
  }));
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nameTouched) return;
    setDraft(d => ({
      ...d,
      name: suggestSubaccountName(accountDisplayName, d.reporting_type),
    }));
  }, [accountDisplayName, draft.reporting_type, nameTouched]);

  async function submit() {
    if (!draft.name.trim()) {
      setError("Sub-account name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${originClientId}/add-offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          reporting_type: draft.reporting_type,
          ghl_location_id: draft.ghl_location_id.trim() || null,
          mrr: draft.mrr === "" ? null : Number(draft.mrr),
          lifecycle_status: draft.lifecycle_status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add offer");
      onCreated({ id: data.client.id, name: data.client.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add offer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "rgba(2,6,15,0.72)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl"
        style={{ background: "#0a1628", border: "1px solid rgba(56,189,248,0.2)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>Add offer to {accountDisplayName}</h3>
          <p className="text-xs mt-1" style={{ color: "#64748b" }}>
            Creates a new subaccount row under this client. You&apos;ll land in the new offer file to finish kick-off and GHL mapping.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ color: "#fca5a5", background: "rgba(239,68,68,0.1)" }}>
              {error}
            </p>
          )}

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "#64748b" }}>Product</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {REPORTING_TYPES.map(rt => {
                const meta = REPORTING_TYPE_META[rt];
                const active = draft.reporting_type === rt;
                const alreadyHas = existingReportingTypes.some(t => normalizeReportingType(t) === rt);
                return (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, reporting_type: rt }))}
                    className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                    style={{
                      color: active ? meta.color : "#94a3b8",
                      background: active ? meta.background : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? `${meta.color}55` : "rgba(255,255,255,0.1)"}`,
                      opacity: alreadyHas && !active ? 0.7 : 1,
                    }}
                    title={alreadyHas ? `${meta.label} already on this account` : meta.description}
                  >
                    {meta.shortLabel}
                    {alreadyHas ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "#64748b" }}>GHL sub-account name *</span>
            <input
              value={draft.name}
              onChange={e => {
                setNameTouched(true);
                setDraft(d => ({ ...d, name: e.target.value }));
              }}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "#060d1a", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
              placeholder="Ken Adler - DSCR"
              autoFocus
            />
            <p className="text-[11px] mt-1" style={{ color: "#475569" }}>Must match the GHL location name exactly.</p>
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "#64748b" }}>GHL location ID</span>
            <input
              value={draft.ghl_location_id}
              onChange={e => setDraft(d => ({ ...d, ghl_location_id: e.target.value }))}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "#060d1a", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
              placeholder="Optional — can set in kick-off"
            />
          </label>

          {canViewRevenue && (
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "#64748b" }}>MRR</span>
              <input
                type="number"
                value={draft.mrr}
                onChange={e => setDraft(d => ({ ...d, mrr: e.target.value }))}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: "#060d1a", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
                placeholder="Optional"
              />
            </label>
          )}
        </div>

        <div className="px-5 py-4 flex items-center justify-end gap-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-xs font-semibold px-4 py-2 rounded-lg"
            style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="text-xs font-semibold px-4 py-2 rounded-lg"
            style={{ color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Creating…" : "Create & open offer"}
          </button>
        </div>
      </div>
    </div>
  );
}

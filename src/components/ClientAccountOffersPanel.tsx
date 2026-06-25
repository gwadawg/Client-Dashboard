"use client";

import { useCallback, useEffect, useState } from "react";
import AddClientOfferModal from "@/components/AddClientOfferModal";
import ReportingTypeBadge from "@/components/ReportingTypeBadge";
import { lifecycleStatusLabel } from "@/lib/client-feedback";

type Sibling = {
  id: string;
  name: string;
  reporting_type: string | null;
  lifecycle_status: string | null;
  mrr: number | null;
  engagement_kind: string | null;
};

type Engagement = {
  id: string;
  engagement_kind: string;
  reporting_type: string;
  sales_package: string | null;
  mrr_snapshot: number | null;
  closed_at: string | null;
  created_at: string;
  from_client_id: string | null;
  to_client_id: string;
};

type AccountGroup = {
  id: string;
  display_name: string;
  primary_email: string | null;
};

function money(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function engagementLabel(kind: string | null): string {
  if (kind === "upsell") return "Upsell";
  if (kind === "cross_sell") return "Cross-sell";
  return "Initial";
}

export default function ClientAccountOffersPanel({
  clientId,
  canViewRevenue,
  onSwitchClient,
  onOfferAdded,
  defaultShowAdd = false,
}: {
  clientId: string;
  canViewRevenue: boolean;
  onSwitchClient: (id: string, name: string) => void;
  onOfferAdded?: (id: string, name: string) => void;
  defaultShowAdd?: boolean;
}) {
  const [accountGroup, setAccountGroup] = useState<AccountGroup | null>(null);
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(defaultShowAdd);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/siblings`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load related offers");
      setAccountGroup(data.account_group ?? null);
      setSiblings(data.siblings ?? []);
      setEngagements(data.engagements ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (defaultShowAdd) setShowAdd(true);
  }, [defaultShowAdd, clientId]);

  const accountName = accountGroup?.display_name ?? "this client";
  const hasMultiple = siblings.length > 1;
  const accountMrr = canViewRevenue
    ? siblings.reduce((sum, s) => sum + (typeof s.mrr === "number" ? s.mrr : 0), 0)
    : null;

  if (loading) {
    return (
      <div className="rounded-lg px-4 py-3" style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-xs" style={{ color: "#64748b" }}>Loading offers for this client…</p>
      </div>
    );
  }

  return (
    <>
      {showAdd && (
        <AddClientOfferModal
          originClientId={clientId}
          accountDisplayName={accountName}
          existingReportingTypes={siblings.map(s => s.reporting_type).filter(Boolean) as string[]}
          canViewRevenue={canViewRevenue}
          onClose={() => setShowAdd(false)}
          onCreated={async ({ id, name }) => {
            setShowAdd(false);
            await load();
            onOfferAdded?.(id, name);
          }}
        />
      )}

      <div
        className="rounded-lg px-4 py-3 space-y-3"
        style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.18)" }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
              Client offers
              {hasMultiple && (
                <span className="ml-2 text-xs font-normal" style={{ color: "#94a3b8" }}>
                  {siblings.length} subaccounts
                </span>
              )}
            </p>
            {accountGroup?.primary_email && (
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>{accountGroup.primary_email}</p>
            )}
            {canViewRevenue && accountMrr != null && accountMrr > 0 && (
              <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                Combined MRR {money(accountMrr)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setShowAdd(true); setError(null); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}
            >
              + Add offer
            </button>
            {engagements.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory(v => !v)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {showHistory ? "Hide history" : "Engagement history"}
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}

        {siblings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {siblings.map(s => {
              const isCurrent = s.id === clientId;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => onSwitchClient(s.id, s.name)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
                  style={{
                    background: isCurrent ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.04)",
                    border: isCurrent ? "1px solid rgba(56,189,248,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    opacity: isCurrent ? 1 : 0.95,
                    cursor: isCurrent ? "default" : "pointer",
                  }}
                >
                  {s.reporting_type && <ReportingTypeBadge value={s.reporting_type} size="sm" />}
                  <span className="text-xs font-medium" style={{ color: "#e2e8f0" }}>{s.name}</span>
                  <span className="text-xs" style={{ color: "#64748b" }}>
                    {lifecycleStatusLabel(s.lifecycle_status)}
                  </span>
                  {canViewRevenue && typeof s.mrr === "number" && (
                    <span className="text-xs" style={{ color: "#94a3b8" }}>{money(s.mrr)}</span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] uppercase font-bold" style={{ color: "#38bdf8" }}>viewing</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {showHistory && engagements.length > 0 && (
          <div className="pt-2 border-t space-y-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {engagements.map(e => (
              <div key={e.id} className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "#94a3b8" }}>
                <ReportingTypeBadge value={e.reporting_type} size="sm" />
                <span>{engagementLabel(e.engagement_kind)}</span>
                {canViewRevenue && e.mrr_snapshot != null && <span>{money(e.mrr_snapshot)} MRR</span>}
                <span style={{ color: "#64748b" }}>
                  {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

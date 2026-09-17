"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACTIVE_SALES_PACKAGE_CODES,
  getSalesPackageLabel,
} from "@/lib/offer-catalog";
import {
  emptyReinstateDraft,
  GHL_REUSE_OPTIONS,
  reinstateValidationError,
  type GhlReuse,
  type ReinstateEngagement,
  type ReinstateFormDraft,
} from "@/lib/reinstate-form";
import {
  REPORTING_TYPE_OPTIONS,
  REPORTING_TYPES,
} from "@/lib/reporting-types";

type ReinstatePickerClient = {
  id: string;
  name: string;
  email: string | null;
  offer: string | null;
  churned_at: string | null;
  mrr: number | string | null;
};

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
} as const;

const GHL_REUSE_LABELS: Record<GhlReuse, string> = {
  yes: "Yes — reuse existing GHL sub-account",
  no: "No — needs a new GHL sub-account",
  unsure: "Unsure — CS will confirm",
};

type Props = {
  initialClientId?: string | null;
  onClientIdChange?: (clientId: string | null) => void;
};

export default function ReinstateFormPage({
  initialClientId = null,
  onClientIdChange,
}: Props) {
  const [clients, setClients] = useState<ReinstatePickerClient[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId);
  const [pinnedClient, setPinnedClient] = useState<ReinstatePickerClient | null>(null);
  const [draft, setDraft] = useState<ReinstateFormDraft>(() => emptyReinstateDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [welcomeBackUrl, setWelcomeBackUrl] = useState<string | null>(null);
  const [resultKind, setResultKind] = useState<"success" | "idempotent" | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const next = search.trim();
    if (next === debouncedSearch) return;
    const timer = setTimeout(() => setDebouncedSearch(next), 300);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("q", debouncedSearch);
        const qs = params.toString();
        const res = await fetch(qs ? `/api/clients/reinstate?${qs}` : "/api/clients/reinstate");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setListError(data.error ?? "Failed to load churned clients");
          setClients([]);
          return;
        }
        setClients(data.clients ?? []);
        setListError(null);
      } catch {
        if (!cancelled) setListError("Failed to load churned clients");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  useEffect(() => {
    if (initialClientId) setSelectedClientId(initialClientId);
  }, [initialClientId]);

  const selectedClient =
    clients.find(c => c.id === selectedClientId) ??
    (pinnedClient?.id === selectedClientId ? pinnedClient : null);

  useEffect(() => {
    if (selectedClient) setPinnedClient(selectedClient);
  }, [selectedClient]);

  useEffect(() => {
    if (!selectedClient) return;
    const client = selectedClient;
    setDraft(prev => {
      if (prev.client_id === client.id) return prev;
      const product = productFromClientOffer(client.offer);
      return {
        ...emptyReinstateDraft(),
        client_id: client.id,
        offer: (client.offer ?? "").trim() || product,
        reporting_type: product,
        mrr: coerceNumber(client.mrr),
        closer_name: prev.closer_name,
        closed_at: prev.closed_at,
      };
    });
  }, [selectedClient]);

  const pickerClients = useMemo(() => {
    if (!pinnedClient) return clients;
    if (clients.some(c => c.id === pinnedClient.id)) return clients;
    return [pinnedClient, ...clients];
  }, [clients, pinnedClient]);

  const missingPrefill =
    Boolean(initialClientId) &&
    !listLoading &&
    !selectedClient &&
    !listError;

  function selectClient(id: string | null) {
    setSelectedClientId(id);
    onClientIdChange?.(id);
    setSaveError(null);
    setWelcomeBackUrl(null);
    setResultKind(null);
    setCopied(false);
    if (!id) {
      setPinnedClient(null);
      setDraft(prev => ({
        ...emptyReinstateDraft(),
        closer_name: prev.closer_name,
        closed_at: prev.closed_at,
      }));
    }
  }

  function setEngagement(engagement: ReinstateEngagement) {
    setDraft(prev => ({
      ...prev,
      engagement,
      ghl_reuse: engagement === "new_offer" && prev.ghl_reuse === "yes" ? "unsure" : prev.ghl_reuse,
    }));
  }

  async function handleSubmit() {
    const err = reinstateValidationError(draft);
    if (err) {
      setSaveError(err);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/clients/reinstate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      const url = typeof data.welcome_back_url === "string" ? data.welcome_back_url : "";
      if (url) {
        setWelcomeBackUrl(url);
        setResultKind(res.status === 409 ? "idempotent" : "success");
        if (res.status === 409) {
          setSaveError(typeof data.error === "string" ? data.error : "Already reinstated recently.");
        }
        return;
      }
      if (!res.ok) {
        setResultKind(null);
        setWelcomeBackUrl(null);
        setSaveError(data.error ?? "Failed to reinstate client");
        return;
      }
      setResultKind("success");
    } catch (e) {
      setResultKind(null);
      setWelcomeBackUrl(null);
      setSaveError(e instanceof Error ? e.message : "Failed to reinstate client");
    } finally {
      setSaving(false);
    }
  }

  async function copyWelcomeBackUrl() {
    if (!welcomeBackUrl) return;
    try {
      await navigator.clipboard.writeText(welcomeBackUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setSaveError("Could not copy — select the link and copy manually.");
    }
  }

  const submitted = resultKind === "success" || resultKind === "idempotent";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-200">Client Reinstate</h2>
        <p className="text-sm mt-1 text-slate-500">
          Pick a churned client, log the winback close, and issue a welcome-back onboarding link.
          Same file reopens this row; new offer creates a sibling file.
        </p>
      </div>

      <section
        className="rounded-xl p-5 space-y-4"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div>
          <p className="text-sm font-semibold text-slate-200">1. Select churned client</p>
          <p className="text-xs mt-0.5 text-slate-500">Search by name or email. Only churned clients appear.</p>
        </div>

        {listLoading && clients.length === 0 ? (
          <p className="text-sm text-slate-500">Loading churned clients…</p>
        ) : listError ? (
          <p className="text-sm text-red-400">{listError}</p>
        ) : (
          <>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search churned clients…"
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
              {pickerClients.map(c => (
                <option key={c.id} value={c.id}>
                  {clientLabel(c)}
                </option>
              ))}
            </select>
            {pickerClients.length === 0 && (
              <p className="text-xs text-slate-500">
                {debouncedSearch ? "No churned clients match your search." : "No churned clients found."}
              </p>
            )}
            {missingPrefill && (
              <p className="text-xs text-amber-300">
                That client is not in the churned list (already reinstated, or you don&apos;t have access).
              </p>
            )}
            {selectedClient && (
              <div className="rounded-lg px-3 py-3 bg-white/5 border border-white/10 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{selectedClient.name}</p>
                    <p className="text-xs text-slate-500 truncate">{selectedClient.email || "No email on file"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectClient(null)}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-200 shrink-0"
                  >
                    Change
                  </button>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Prior offer</dt>
                    <dd className="text-slate-300 mt-0.5">{selectedClient.offer?.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Churned</dt>
                    <dd className="text-slate-300 mt-0.5">{formatDate(selectedClient.churned_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">MRR</dt>
                    <dd className="text-slate-300 mt-0.5">{formatMrr(selectedClient.mrr)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </>
        )}
      </section>

      {selectedClient && (
        <section
          className="rounded-xl p-5 space-y-5"
          style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div>
            <p className="text-sm font-semibold text-slate-200">2. Winback details</p>
            <p className="text-xs mt-0.5 text-slate-500">
              {selectedClient?.name ?? "Selected client"} — deal terms for the rejoin.
            </p>
          </div>

          {welcomeBackUrl && (
            <WelcomeBackLinkCard
              url={welcomeBackUrl}
              kind={resultKind ?? "success"}
              copied={copied}
              onCopy={() => void copyWelcomeBackUrl()}
            />
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-400">Engagement *</p>
            <div className="grid grid-cols-2 gap-2">
              <EngagementButton
                active={draft.engagement === "same_file"}
                disabled={submitted}
                onClick={() => setEngagement("same_file")}
                title="Same file"
                hint="Reopen this client row. Keep GHL mapping and original tenure start."
              />
              <EngagementButton
                active={draft.engagement === "new_offer"}
                disabled={submitted}
                onClick={() => setEngagement("new_offer")}
                title="New offer"
                hint="Create a sibling offer file. Origin stays churned."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-400">Offer *</span>
              <input
                type="text"
                disabled={submitted}
                value={draft.offer}
                onChange={e => setDraft(prev => ({ ...prev, offer: e.target.value }))}
                placeholder="Product or package name"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                style={fieldStyle}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-400">Reporting type</span>
              <select
                value={draft.reporting_type}
                disabled={submitted}
                onChange={e => {
                  const value = e.target.value;
                  setDraft(prev => ({
                    ...prev,
                    reporting_type: value,
                    offer: prev.offer.trim() && prev.offer !== prev.reporting_type ? prev.offer : value,
                  }));
                }}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer disabled:opacity-60"
                style={fieldStyle}
              >
                <option value="">Select product…</option>
                {REPORTING_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                {draft.reporting_type &&
                  !REPORTING_TYPE_OPTIONS.some(o => o.value === draft.reporting_type) && (
                    <option value={draft.reporting_type}>{draft.reporting_type}</option>
                  )}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-400">Sales package</span>
            <select
              value={draft.sales_package}
              disabled={submitted}
              onChange={e => setDraft(prev => ({ ...prev, sales_package: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer disabled:opacity-60"
              style={fieldStyle}
            >
              <option value="">Not set</option>
              {ACTIVE_SALES_PACKAGE_CODES.map(code => (
                <option key={code} value={code}>
                  {getSalesPackageLabel(code)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-400">MRR</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={submitted}
                value={draft.mrr ?? ""}
                onChange={e => setDraft(prev => ({ ...prev, mrr: parseNumberInput(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                style={fieldStyle}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-400">Cash collected</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={submitted}
                value={draft.cash_collected ?? ""}
                onChange={e =>
                  setDraft(prev => ({ ...prev, cash_collected: parseNumberInput(e.target.value) }))
                }
                className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                style={fieldStyle}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-400">Date signed *</span>
              <input
                type="date"
                disabled={submitted}
                value={draft.closed_at}
                onChange={e => setDraft(prev => ({ ...prev, closed_at: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                style={fieldStyle}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-400">Closer name *</span>
              <input
                type="text"
                disabled={submitted}
                value={draft.closer_name}
                onChange={e => setDraft(prev => ({ ...prev, closer_name: e.target.value }))}
                placeholder="Who closed this rejoin?"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                style={fieldStyle}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-400">Contract term (months)</span>
              <input
                type="number"
                min="0"
                step="1"
                disabled={submitted}
                value={draft.contract_term_months ?? ""}
                onChange={e =>
                  setDraft(prev => ({
                    ...prev,
                    contract_term_months: parseIntegerInput(e.target.value),
                  }))
                }
                className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                style={fieldStyle}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-400">Contract end date</span>
              <input
                type="date"
                disabled={submitted}
                value={draft.contract_end_date}
                onChange={e => setDraft(prev => ({ ...prev, contract_end_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-60"
                style={fieldStyle}
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-400">Reuse existing GHL sub-account?</span>
            <select
              value={draft.ghl_reuse}
              disabled={submitted}
              onChange={e => {
                const value = e.target.value as GhlReuse;
                setDraft(prev => ({
                  ...prev,
                  ghl_reuse: prev.engagement === "new_offer" && value === "yes" ? "unsure" : value,
                }));
              }}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer disabled:opacity-60"
              style={fieldStyle}
            >
              {GHL_REUSE_OPTIONS.map(option => (
                <option
                  key={option}
                  value={option}
                  disabled={draft.engagement === "new_offer" && option === "yes"}
                >
                  {GHL_REUSE_LABELS[option]}
                </option>
              ))}
            </select>
            {draft.engagement === "new_offer" && (
              <p className="text-xs text-slate-500">
                New offer cannot reuse the old GHL sub-account on the sibling row.
              </p>
            )}
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-400">Pauses</p>
            <p className="text-xs text-slate-500">
              Billing and ads pauses are cleared on reinstate unless you leave them on.
            </p>
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                disabled={submitted}
                checked={draft.leave_billing_paused}
                onChange={e => setDraft(prev => ({ ...prev, leave_billing_paused: e.target.checked }))}
                className="mt-0.5"
              />
              <span>Leave billing paused</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                disabled={submitted}
                checked={draft.leave_ads_paused}
                onChange={e => setDraft(prev => ({ ...prev, leave_ads_paused: e.target.checked }))}
                className="mt-0.5"
              />
              <span>Leave ads paused</span>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-400">Internal notes</span>
            <textarea
              disabled={submitted}
              value={draft.internal_notes}
              onChange={e => setDraft(prev => ({ ...prev, internal_notes: e.target.value }))}
              rows={3}
              placeholder="Handoff context for CS — GHL path, billing quirks, why they came back."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y disabled:opacity-60"
              style={fieldStyle}
            />
          </label>

          {saveError && resultKind !== "idempotent" && (
            <p className="text-sm rounded-lg px-4 py-3 text-red-400 bg-red-950/40 border border-red-500/30">
              {saveError}
            </p>
          )}
          {saveError && resultKind === "idempotent" && (
            <p className="text-sm rounded-lg px-4 py-3 text-amber-200 bg-amber-950/40 border border-amber-500/30">
              {saveError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || submitted}
            className="w-full text-sm font-semibold px-4 py-3 rounded-lg disabled:opacity-50"
            style={{ background: saving || submitted ? "#334155" : "#38bdf8", color: "#0f172a" }}
          >
            {saving ? "Submitting…" : submitted ? "Submitted" : "Reinstate client"}
          </button>
        </section>
      )}

      {!selectedClientId && !listLoading && (
        <p className="text-sm text-center py-8 text-slate-500">
          Select a churned client above to begin the reinstate form.
        </p>
      )}
    </div>
  );
}

function WelcomeBackLinkCard({
  url,
  kind,
  copied,
  onCopy,
}: {
  url: string;
  kind: "success" | "idempotent";
  copied: boolean;
  onCopy: () => void;
}) {
  const isIdempotent = kind === "idempotent";
  return (
    <div
      className="rounded-lg px-4 py-4 space-y-3"
      style={{
        background: isIdempotent ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.1)",
        border: isIdempotent ? "1px solid rgba(245,158,11,0.35)" : "1px solid rgba(16,185,129,0.35)",
      }}
    >
      <p className={`text-sm font-semibold ${isIdempotent ? "text-amber-200" : "text-emerald-300"}`}>
        {isIdempotent ? "Already reinstated — use the existing welcome-back link." : "Welcome-back link ready"}
      </p>
      <p className="text-xs text-slate-400">
        Send this to the client so they can confirm or update their onboarding info.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={e => e.currentTarget.select()}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs font-mono outline-none"
          style={fieldStyle}
        />
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ background: "#1e3a5f", color: "#e2e8f0" }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function EngagementButton({
  active,
  disabled,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-left rounded-lg px-3 py-2.5 disabled:opacity-60"
      style={{
        background: active ? "rgba(56,189,248,0.16)" : "rgba(255,255,255,0.04)",
        border: active ? "1px solid rgba(56,189,248,0.45)" : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <p className="text-sm font-semibold" style={{ color: active ? "#7dd3fc" : "#e2e8f0" }}>
        {title}
      </p>
      <p className="text-[11px] mt-0.5 leading-snug text-slate-500">{hint}</p>
    </button>
  );
}

function clientLabel(c: ReinstatePickerClient): string {
  return c.email ? `${c.name} · ${c.email}` : c.name;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMrr(n: number | string | null): string {
  const value = coerceNumber(n);
  if (value == null) return "—";
  return `$${value.toLocaleString()}`;
}

function coerceNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseNumberInput(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseIntegerInput(value: string): number | null {
  const n = parseNumberInput(value);
  if (n == null) return null;
  return Math.trunc(n);
}

function productFromClientOffer(offer: string | null): string {
  const raw = (offer ?? "").trim();
  if (!raw) return "";
  const normalized = raw.toUpperCase().replace(/\s+/g, "_");
  if ((REPORTING_TYPES as readonly string[]).includes(normalized)) return normalized;
  const lower = raw.toLowerCase();
  if (lower.includes("dscr")) return "DSCR";
  if (lower.includes("call center") || lower === "he" || lower === "cc") return "CALL_CENTER";
  if (lower.includes("reverse") || lower === "rm") return "RM";
  return "";
}

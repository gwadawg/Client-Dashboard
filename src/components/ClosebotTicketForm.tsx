"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { formatLogDate } from "@/lib/closebot";

const inputStyle: CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

type Option = { id: string; name: string };
type TypeOption = { slug: string; name: string; description: string | null };
type CoveringFix = { id?: string; changed_at: string; problem_solved: string };
type DoneState = "actionable" | "pre_fix" | null;

function ErrorTypePicker({
  types,
  value,
  onChange,
  disabled,
}: {
  types: TypeOption[];
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const selected = types.find((t) => t.slug === value) ?? null;
  const preview = types.find((t) => t.slug === previewSlug) ?? (open ? selected : null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative space-y-1">
      <span className="text-xs font-medium text-slate-400">Error type</span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((v) => !v);
          setPreviewSlug(value || null);
        }}
        className="w-full rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2"
        style={inputStyle}
      >
        <span style={{ color: selected ? "#e2e8f0" : "#64748b" }}>
          {selected?.name ?? "Select error type"}
        </span>
        <span aria-hidden className="text-[10px]" style={{ color: "#64748b" }}>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-xl overflow-hidden" style={{ background: "#0f2040", border: "1px solid rgba(245,158,11,0.35)", boxShadow: "0 18px 40px rgba(0,0,0,0.45)" }}>
          {preview?.description ? (
            <div className="px-3 py-2.5" style={{ background: "#140e08", borderBottom: "1px solid rgba(245,158,11,0.35)" }}>
              <p className="cb-form-hint-kicker">{preview.name}</p>
              <p className="text-[13px] leading-snug" style={{ color: "#f5f5f4" }}>
                {preview.description}
              </p>
            </div>
          ) : (
            <p className="px-3 py-2 text-[11px]" style={{ color: "#78716c" }}>
              Hover an option to see what it covers.
            </p>
          )}
          <ul id={listId} role="listbox" aria-label="Error types" className="max-h-56 overflow-auto py-1">
            {types.map((t) => {
              const active = t.slug === value;
              const hovered = t.slug === previewSlug;
              return (
                <li key={t.slug} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm"
                    style={{
                      background: hovered ? "rgba(245,158,11,0.16)" : active ? "rgba(255,255,255,0.06)" : "transparent",
                      color: hovered || active ? "#fde68a" : "#e2e8f0",
                    }}
                    onMouseEnter={() => setPreviewSlug(t.slug)}
                    onFocus={() => setPreviewSlug(t.slug)}
                    onClick={() => {
                      onChange(t.slug);
                      setOpen(false);
                    }}
                  >
                    {t.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <input
        tabIndex={-1}
        required
        value={value}
        onChange={() => {}}
        className="absolute h-0 w-0 opacity-0 pointer-events-none"
        aria-hidden
      />
      <span className="text-[11px] text-slate-600">
        Hover an option in the list to see what that type covers.
      </span>
    </div>
  );
}

export default function ClosebotTicketForm() {
  const [clients, setClients] = useState<Option[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState>(null);
  const [doneFix, setDoneFix] = useState<CoveringFix | null>(null);
  const [reporterName, setReporterName] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientId, setClientId] = useState("");
  const [bugType, setBugType] = useState("");
  const [description, setDescription] = useState("");
  const [contactUrl, setContactUrl] = useState("");
  const [faxNumber, setFaxNumber] = useState("");
  const [previewCoverage, setPreviewCoverage] = useState<"actionable" | "pre_fix" | null>(null);
  const [previewFix, setPreviewFix] = useState<CoveringFix | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/closebot/tickets/public/options");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setLoadError(data.error || "Could not load form options");
          return;
        }
        if (!cancelled) {
          setClients(Array.isArray(data.clients) ? data.clients : []);
          setTypes(Array.isArray(data.types) ? data.types : []);
        }
      } catch {
        if (!cancelled) setLoadError("Could not load form options");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clientId || !bugType || !occurredAt) {
      setPreviewCoverage(null);
      setPreviewFix(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            client_id: clientId,
            bug_type: bugType,
            occurred_at: occurredAt,
          });
          const res = await fetch(`/api/closebot/tickets/public/coverage?${params}`);
          const data = await res.json().catch(() => ({}));
          if (cancelled || !res.ok) return;
          if (data.coverage === "pre_fix") {
            setPreviewCoverage("pre_fix");
            setPreviewFix(
              data.covering_fix && typeof data.covering_fix.problem_solved === "string"
                ? data.covering_fix
                : null,
            );
          } else {
            setPreviewCoverage("actionable");
            setPreviewFix(null);
          }
        } catch {
          if (!cancelled) {
            setPreviewCoverage(null);
            setPreviewFix(null);
          }
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientId, bugType, occurredAt]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!bugType) {
      setError("Pick an error type");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/closebot/tickets/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporter_name: reporterName,
          occurred_at: occurredAt,
          client_id: clientId,
          bug_type: bugType,
          description,
          contact_url: contactUrl,
          fax_number: faxNumber,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not submit ticket");
        return;
      }
      const coverage = data.coverage === "pre_fix" ? "pre_fix" : "actionable";
      setDone(coverage);
      setDoneFix(
        coverage === "pre_fix" && data.covering_fix && typeof data.covering_fix.problem_solved === "string"
          ? data.covering_fix
          : null,
      );
    } catch {
      setError("Could not submit ticket");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const historical = done === "pre_fix";
    return (
      <div
        className="max-w-xl mx-auto rounded-2xl p-8 text-center space-y-3"
        style={{
          background: historical ? "#140e08" : "#0a1628",
          border: historical ? "1px solid rgba(245,158,11,0.45)" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <p
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: "#f59e0b", fontFamily: "var(--font-archivo)" }}
        >
          {historical ? "Already in the books" : "Filed"}
        </p>
        <p className="text-lg font-semibold text-slate-100">
          {historical ? "Logged as historical" : "Ticket submitted"}
        </p>
        <p className="text-sm text-slate-400">
          {historical
            ? "This error type was already fixed after that date. Ops will see it under Already shipped, not as a new live bug."
            : "Ops will see this under Closebot → Tickets, routed to the agent for that client."}
        </p>
        {historical && doneFix && (
          <p className="text-xs" style={{ color: "#fde68a" }}>
            Covering update {formatLogDate(doneFix.changed_at)} — {doneFix.problem_solved}
          </p>
        )}
        <button
          type="button"
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ background: "#f59e0b", color: "#1a1206" }}
          onClick={() => {
            setDone(null);
            setDoneFix(null);
            setDescription("");
            setContactUrl("");
            setBugType("");
            setPreviewCoverage(null);
            setPreviewFix(null);
          }}
        >
          Submit another
        </button>
      </div>
    );
  }

  const blockedReason =
    clients.length === 0
      ? "No clients are assigned to a Closebot agent yet. Ask ops to add clients on the agent in Closebot → Updates."
      : types.length === 0
        ? "No error types in the library yet. Ask ops to add them under Closebot → Tickets → Type library."
        : null;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <style>{`
        .cb-form-hint { position: relative; display: block; }
        .cb-form-hint-box {
          position: absolute;
          left: 0;
          bottom: calc(100% + 8px);
          width: min(22rem, 90%);
          padding: 0.75rem 0.9rem;
          border-radius: 0.7rem;
          background: #140e08;
          border: 1px solid rgba(245,158,11,0.45);
          box-shadow: 0 18px 40px rgba(0,0,0,0.45);
          color: #f5f5f4;
          font-size: 0.8125rem;
          line-height: 1.45;
          opacity: 0;
          visibility: hidden;
          transform: translateY(6px);
          transition: opacity 140ms ease, transform 140ms ease, visibility 140ms ease;
          z-index: 20;
          pointer-events: none;
        }
        .cb-form-hint-kicker {
          display: block;
          margin-bottom: 0.3rem;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #f59e0b;
        }
        .cb-form-hint:hover .cb-form-hint-box,
        .cb-form-hint:focus-within .cb-form-hint-box {
          opacity: 1;
          visibility: visible;
          transform: none;
        }
      `}</style>
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Closebot incident ticket</h1>
        <p className="text-sm mt-2 text-slate-500">
          Pick the client, the date it happened, and the error type from the library. You do not need to know which agent is live.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading form…</p>
      ) : loadError ? (
        <p className="text-sm text-red-400">{loadError}</p>
      ) : blockedReason ? (
        <p className="text-sm text-slate-500">{blockedReason}</p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="relative space-y-4 rounded-2xl p-5" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.08)" }}>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">Your name</span>
            <input
              required
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">Date the occurrence happened</span>
            <input
              required
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            />
          </label>
          <ErrorTypePicker types={types} value={bugType} onChange={setBugType} disabled={saving} />
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">Client</span>
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            >
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {previewCoverage === "pre_fix" && (
            <div
              className="rounded-xl px-4 py-3 space-y-1"
              style={{
                background: "#140e08",
                border: "1px dashed rgba(245,158,11,0.55)",
              }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "#f59e0b", fontFamily: "var(--font-archivo)" }}
              >
                Already shipped
              </p>
              <p className="text-sm" style={{ color: "#fde68a" }}>
                This error type was already fixed after that date. Submitting files it as historical, not as a new bug.
              </p>
              {previewFix && (
                <p className="text-xs" style={{ color: "#a8a29e" }}>
                  {formatLogDate(previewFix.changed_at)} — {previewFix.problem_solved}
                </p>
              )}
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">What happened</span>
            <textarea
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
              placeholder="What the bot said or did, vs what should have happened."
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">Link to contact</span>
            <input
              required
              value={contactUrl}
              onChange={(e) => setContactUrl(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
              placeholder="https://…"
            />
          </label>
          <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
            <label>
              Fax number
              <input
                tabIndex={-1}
                autoComplete="off"
                value={faxNumber}
                onChange={(e) => setFaxNumber(e.target.value)}
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: "#f59e0b", color: "#1a1206" }}
          >
            {saving ? "Submitting…" : previewCoverage === "pre_fix" ? "Log as historical" : "Submit ticket"}
          </button>
        </form>
      )}
    </div>
  );
}

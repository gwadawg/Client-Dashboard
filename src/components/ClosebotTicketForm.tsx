"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

const inputStyle: CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

type Option = { id: string; name: string };
type TypeOption = { slug: string; name: string; description: string | null };

export default function ClosebotTicketForm() {
  const [clients, setClients] = useState<Option[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reporterName, setReporterName] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientId, setClientId] = useState("");
  const [bugType, setBugType] = useState("");
  const [description, setDescription] = useState("");
  const [contactUrl, setContactUrl] = useState("");
  const [faxNumber, setFaxNumber] = useState("");

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

  const selectedType = useMemo(
    () => types.find((t) => t.slug === bugType) ?? null,
    [types, bugType],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      setDone(true);
    } catch {
      setError("Could not submit ticket");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl p-8 text-center space-y-3" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-lg font-semibold text-slate-100">Ticket submitted</p>
        <p className="text-sm text-slate-400">
          Ops will see this under Closebot → Tickets, routed to the agent for that client.
        </p>
        <button
          type="button"
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ background: "#f59e0b", color: "#1a1206" }}
          onClick={() => {
            setDone(false);
            setDescription("");
            setContactUrl("");
            setBugType("");
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
          <label className="cb-form-hint block space-y-1">
            {selectedType?.description ? (
              <span className="cb-form-hint-box" role="tooltip">
                <span className="cb-form-hint-kicker">{selectedType.name}</span>
                {selectedType.description}
              </span>
            ) : null}
            <span className="text-xs font-medium text-slate-400">Error type</span>
            <select
              required
              value={bugType}
              onChange={(e) => setBugType(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            >
              <option value="">Select error type</option>
              {types.map((t) => (
                <option key={t.slug} value={t.slug} title={t.description ?? ""}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedType?.description ? (
              <span className="text-[11px] text-slate-500">Hover this field for what this type covers.</span>
            ) : (
              <span className="text-[11px] text-slate-600">Types come from Closebot → Tickets → Type library.</span>
            )}
          </label>
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
            {saving ? "Submitting…" : "Submit ticket"}
          </button>
        </form>
      )}
    </div>
  );
}

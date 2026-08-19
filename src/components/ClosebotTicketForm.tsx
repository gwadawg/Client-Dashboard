"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  CLOSEBOT_BUG_TYPES,
  CLOSEBOT_BUG_TYPE_META,
} from "@/lib/closebot";

const inputStyle: CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

type Option = { id: string; name: string };

export default function ClosebotTicketForm() {
  const [agents, setAgents] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reporterName, setReporterName] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientId, setClientId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [bugType, setBugType] = useState<(typeof CLOSEBOT_BUG_TYPES)[number]>("wrong_reply");
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
          setAgents(Array.isArray(data.agents) ? data.agents : []);
          setClients(Array.isArray(data.clients) ? data.clients : []);
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
          agent_id: agentId,
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
          Ops will see this on Closebot Log and attach it to the agent version that was live that day.
        </p>
        <button
          type="button"
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ background: "#f59e0b", color: "#1a1206" }}
          onClick={() => {
            setDone(false);
            setDescription("");
            setContactUrl("");
            setBugType("wrong_reply");
          }}
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Closebot incident ticket</h1>
        <p className="text-sm mt-2 text-slate-500">
          Log when Closebot got something wrong so we can track it by client, agent, and version.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading form…</p>
      ) : loadError ? (
        <p className="text-sm text-red-400">{loadError}</p>
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
            <span className="text-xs font-medium text-slate-400">Date the error occurred</span>
            <input
              required
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            />
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
            <span className="text-xs font-medium text-slate-400">Closebot agent</span>
            <select
              required
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            >
              <option value="">Select agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-400">Type of bug</span>
            <select
              required
              value={bugType}
              onChange={(e) => setBugType(e.target.value as (typeof CLOSEBOT_BUG_TYPES)[number])}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            >
              {CLOSEBOT_BUG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CLOSEBOT_BUG_TYPE_META[t].label}
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

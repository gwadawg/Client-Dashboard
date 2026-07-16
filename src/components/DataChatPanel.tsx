"use client";

import { useEffect, useRef, useState } from "react";

type ScopeId = "fulfillment_kpis" | "setter_performance";

type ScopeOption = {
  id: ScopeId;
  label: string;
  description: string;
};

type ClientOption = { id: string; name: string; is_live?: boolean };

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
};

type Props = {
  startDate: string;
  endDate: string;
  clients: ClientOption[];
  selectedClientId: string;
};

const panelBg = {
  background: "#0a1628",
  border: "1px solid rgba(255,255,255,0.08)",
} as React.CSSProperties;

export default function DataChatPanel({
  startDate,
  endDate,
  clients,
  selectedClientId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<ScopeOption[]>([]);
  const [scopesError, setScopesError] = useState<string | null>(null);
  const [step, setStep] = useState<"scope" | "chat">("scope");
  const [scope, setScope] = useState<ScopeId | null>(null);
  const [clientFilter, setClientFilter] = useState(selectedClientId);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/data-chat");
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setScopesError(data.error ?? "Could not load scopes");
          return;
        }
        if (!cancelled) {
          setScopes(data.scopes ?? []);
          setScopesError(null);
        }
      } catch {
        if (!cancelled) setScopesError("Could not load scopes");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open && step === "scope") {
      setClientFilter(selectedClientId);
    }
  }, [open, step, selectedClientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const scopeMeta = scopes.find(s => s.id === scope);

  const liveOnly = clientFilter === "__live__";
  const clientId =
    clientFilter && clientFilter !== "__live__" ? clientFilter : null;

  const startChat = (next: ScopeId) => {
    setScope(next);
    setStep("chat");
    setMessages([]);
    setError(null);
    setInput("");
  };

  const resetScope = () => {
    setStep("scope");
    setScope(null);
    setMessages([]);
    setError(null);
    setInput("");
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !scope || loading) return;

    const nextMessages: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/data-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          filters: {
            start_date: startDate,
            end_date: endDate,
            client_id: clientId,
            live_only: liveOnly,
          },
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        setMessages(prev => prev.slice(0, -1));
        setInput(text);
      } else {
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: data.reply ?? "",
            toolsUsed: data.toolsUsed,
          },
        ]);
      }
    } catch {
      setError("Request failed");
      setMessages(prev => prev.slice(0, -1));
      setInput(text);
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full px-4 py-3 text-sm font-semibold shadow-lg"
        style={{
          background: "#1e3a5f",
          color: "#e2e8f0",
          border: "1px solid rgba(148,163,184,0.25)",
        }}
        aria-label="Open data chat"
      >
        Data Chat
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-40 flex w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{ ...panelBg, height: "min(640px, calc(100vh - 3rem))" }}
    >
      <div
        className="flex items-start justify-between gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            Mr. Waiz Data Chat
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            {step === "scope"
              ? "Pick a data set first — keeps answers focused and cheap."
              : `${scopeMeta?.label ?? "Chat"} · ${startDate} → ${endDate}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-2 py-1 rounded-md"
          style={{ color: "#94a3b8" }}
        >
          Close
        </button>
      </div>

      {step === "scope" ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {scopesError && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ color: "#fca5a5", background: "rgba(127,29,29,0.35)" }}>
              {scopesError}
            </p>
          )}
          {!scopesError && scopes.length === 0 && (
            <p className="text-xs" style={{ color: "#64748b" }}>
              Loading available data sets…
            </p>
          )}
          {scopes.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => startChat(s.id)}
              className="w-full text-left rounded-xl px-4 py-3 transition-colors"
              style={{
                background: "rgba(15,23,42,0.8)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                {s.label}
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "#64748b" }}>
                {s.description}
              </p>
            </button>
          ))}

          {scopes.some(s => s.id === "fulfillment_kpis") && (
            <div className="pt-2">
              <label className="block text-xs mb-1.5" style={{ color: "#64748b" }}>
                Default client filter (used when you start a chat)
              </label>
              <select
                value={clientFilter}
                onChange={e => setClientFilter(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "#020617",
                  color: "#e2e8f0",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <option value="">All clients</option>
                <option value="__live__">Live clients only</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] mt-1.5" style={{ color: "#475569" }}>
                Dates follow the dashboard range: {startDate} → {endDate}
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            className="flex items-center justify-between gap-2 px-4 py-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <button
              type="button"
              onClick={resetScope}
              className="text-xs"
              style={{ color: "#94a3b8" }}
            >
              ← Change data set
            </button>
            {scope === "fulfillment_kpis" && (
              <select
                value={clientFilter}
                onChange={e => {
                  setClientFilter(e.target.value);
                  setMessages([]);
                }}
                className="max-w-[55%] rounded-md px-2 py-1 text-xs"
                style={{
                  background: "#020617",
                  color: "#cbd5e1",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <option value="">All clients</option>
                <option value="__live__">Live only</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-xs leading-relaxed space-y-2" style={{ color: "#64748b" }}>
                <p>Ask about numbers in this data set only. Examples:</p>
                <ul className="list-disc pl-4 space-y-1">
                  {scope === "fulfillment_kpis" ? (
                    <>
                      <li>What’s the show rate this period?</li>
                      <li>How many qualified leads vs bookings?</li>
                      <li>What’s CPConv for Community First?</li>
                    </>
                  ) : (
                    <>
                      <li>Who led dials this period?</li>
                      <li>What’s team pickup rate?</li>
                      <li>Which agents have the best show rate?</li>
                    </>
                  )}
                </ul>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className="rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                style={
                  m.role === "user"
                    ? { background: "#1e3a5f", color: "#e2e8f0", marginLeft: "1.5rem" }
                    : { background: "rgba(15,23,42,0.9)", color: "#cbd5e1", marginRight: "1.5rem" }
                }
              >
                {m.content}
                {m.toolsUsed && m.toolsUsed.length > 0 && (
                  <p className="text-[10px] mt-2" style={{ color: "#475569" }}>
                    Used: {m.toolsUsed.join(", ")}
                  </p>
                )}
              </div>
            ))}

            {loading && (
              <p className="text-xs" style={{ color: "#64748b" }}>
                Pulling scoped data…
              </p>
            )}
            {error && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ color: "#fca5a5", background: "rgba(127,29,29,0.35)" }}>
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          <div
            className="flex gap-2 p-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={loading}
              placeholder="Ask a question…"
              className="flex-1 rounded-lg px-3 py-2 text-sm"
              style={{
                background: "#020617",
                color: "#e2e8f0",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
              style={{ background: "#1e3a5f", color: "#e2e8f0" }}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

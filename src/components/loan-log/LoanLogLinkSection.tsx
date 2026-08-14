"use client";

import { useState } from "react";

type Props = { clientId: string };

export default function LoanLogLinkSection({ clientId }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/loan-log`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to load link");
      const next = typeof data.url === "string" ? data.url : "";
      if (!next) throw new Error("No link returned");
      setUrl(next);
      await navigator.clipboard.writeText(next);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (!window.confirm("Rotate this link? The old URL will stop working.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/loan-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to rotate");
      setUrl(typeof data.url === "string" ? data.url : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rotate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "#94a3b8" }}>
        Unique public form for this office to log submitted and funded loans.
        Anyone with the URL can submit.
      </p>
      {url && (
        <p className="text-xs font-mono break-all" style={{ color: "#64748b" }}>{url}</p>
      )}
      {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void copy()}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{ background: "#1e3a5f", color: "#e2e8f0" }}
        >
          {copied ? "Copied" : "Copy loan log link"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void rotate()}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{ background: "#0f172a", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Rotate link
        </button>
      </div>
    </div>
  );
}

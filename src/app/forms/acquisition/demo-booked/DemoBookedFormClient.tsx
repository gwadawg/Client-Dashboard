"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { BOOKING_SOURCE_OPTIONS } from "@/lib/acquisition-config";

type Prefetch = {
  contact_id: string;
  appointment_id: string | null;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
  setter_name_default: string | null;
};

const inputStyle: CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

export default function DemoBookedFormClient() {
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contact_id") ?? "";
  const appointmentId = searchParams.get("appointment_id") ?? "";
  const token = searchParams.get("token") ?? "";

  const [prefetch, setPrefetch] = useState<Prefetch | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setterName, setSetterName] = useState("");
  const [bookingSource, setBookingSource] = useState<string>(BOOKING_SOURCE_OPTIONS[0]);
  const [bookedAt, setBookedAt] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [qualified, setQualified] = useState<"" | "yes" | "no">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    ghl_sync_status?: string;
    ghl_sync_error?: string | null;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!contactId || !token) {
      setLoadError("Invalid link — missing contact_id or token.");
      return;
    }

    const qs = new URLSearchParams({ contact_id: contactId, token });
    if (appointmentId) qs.set("appointment_id", appointmentId);

    fetch(`/api/acquisition/forms/demo-booked?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((d: Prefetch) => {
        setPrefetch(d);
        if (d.setter_name_default) setSetterName(d.setter_name_default);
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setBookedAt(local);
        setScheduledAt(local);
      })
      .catch((e) => setLoadError(e.message));
  }, [contactId, appointmentId, token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!contactId || !token) return;

    setSubmitting(true);
    setResult(null);

    try {
      const bookedIso = bookedAt ? new Date(bookedAt).toISOString() : "";
      const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : bookedIso;

      const res = await fetch("/api/acquisition/forms/demo-booked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          appointment_id: appointmentId || null,
          token,
          setter_name: setterName,
          booking_source: bookingSource,
          booked_at: bookedIso,
          scheduled_at: scheduledIso,
          qualified: qualified === "" ? null : qualified === "yes",
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setResult({
        ok: true,
        ghl_sync_status: data.ghl_sync_status,
        ghl_sync_error: data.ghl_sync_error,
      });
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Submit failed",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <p className="text-red-400 font-medium">{loadError}</p>
        <p className="text-sm text-slate-500 mt-2">Ask ops for a fresh magic link from GHL.</p>
      </div>
    );
  }

  if (!prefetch) {
    return <p className="text-sm text-slate-500 text-center py-12">Loading form…</p>;
  }

  if (result?.ok) {
    return (
      <div className="max-w-lg mx-auto space-y-4 py-8">
        <h1 className="text-xl font-semibold text-emerald-400">Demo booking credit logged</h1>
        <p className="text-sm text-slate-400">
          Saved in Mr. Waiz for <strong className="text-slate-200">{prefetch.lead_name ?? contactId}</strong>.
        </p>
        {result.ghl_sync_status === "synced" && (
          <p className="text-sm text-emerald-500/90">GHL contact updated (fields, pipeline, note).</p>
        )}
        {result.ghl_sync_status === "failed" && (
          <p className="text-sm text-amber-400">
            Saved in Mr. Waiz, but GHL sync failed: {result.ghl_sync_error}
          </p>
        )}
        {result.ghl_sync_status === "skipped" && (
          <p className="text-sm text-slate-500">
            GHL sync skipped (token not configured on server).
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Acquisition</p>
        <h1 className="text-2xl font-bold text-slate-100">Demo booking credit</h1>
        <p className="text-sm text-slate-400 mt-2">
          Log setter credit after booking a demo. Updates Mr. Waiz and syncs disposition to GHL.
        </p>
      </div>

      <div
        className="rounded-xl p-4 mb-6 text-sm"
        style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="font-medium text-slate-200">{prefetch.lead_name ?? "Lead"}</p>
        {prefetch.phone && <p className="text-slate-500 mt-1">{prefetch.phone}</p>}
        {prefetch.email && <p className="text-slate-500">{prefetch.email}</p>}
        {appointmentId && (
          <p className="text-xs text-slate-600 mt-2 font-mono">Appt: {appointmentId}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Setter name</span>
          <input
            required
            value={setterName}
            onChange={(e) => setSetterName(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400">Booking source</span>
          <select
            required
            value={bookingSource}
            onChange={(e) => setBookingSource(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          >
            {BOOKING_SOURCE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400">Demo booked at</span>
          <input
            type="datetime-local"
            required
            value={bookedAt}
            onChange={(e) => setBookedAt(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400">Demo scheduled for</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400">Qualified?</span>
          <select
            value={qualified}
            onChange={(e) => setQualified(e.target.value as "" | "yes" | "no")}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
            style={inputStyle}
            placeholder="Context for the booking…"
          />
        </label>

        {result?.error && (
          <p className="text-sm text-red-400">{result.error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: "#f59e0b", color: "#1a1a1a" }}
        >
          {submitting ? "Saving…" : "Submit booking credit"}
        </button>
      </form>
    </div>
  );
}

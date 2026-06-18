"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

type IntroCandidate = {
  id: string;
  ghl_appointment_id: string | null;
  scheduled_at: string | null;
  booked_at: string | null;
  setter_name: string | null;
};

type Prefetch = {
  contact_id: string;
  form_context: string;
  form_mode: "intro_full" | "demo_full" | "claim_only";
  intro_appointment_id: string | null;
  demo_appointment_id: string | null;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
  setter_name_default: string | null;
  booking_source_options: string[];
  intro_candidates: IntroCandidate[];
  claim_intro_call_id: string | null;
  demo_appointment?: { booked_at: string | null; scheduled_at: string | null; booking_source: string | null } | null;
};

const inputStyle: CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

const FUN_OUTCOMES = [
  { value: "pass", label: "FUN pass — book demo path" },
  { value: "boot_camp", label: "Boot Camp route" },
  { value: "nurture", label: "Nurture / rebook" },
  { value: "not_fit", label: "Not fit" },
];

const OUTCOMES = [
  { value: "showed", label: "Showed / connected" },
  { value: "no_show", label: "No show" },
  { value: "connected", label: "Connected (cold call)" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No answer" },
];

type Props = {
  defaultFormContext?: string;
};

export default function IntroReflectionFormClient({ defaultFormContext }: Props) {
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contact_id") ?? "";
  const token = searchParams.get("token") ?? "";
  const formContext =
    searchParams.get("form_context") ?? defaultFormContext ?? "demo_booked";
  const introApptId =
    searchParams.get("intro_appointment_id") ??
    (formContext === "intro_showed" ? searchParams.get("appointment_id") : null) ??
    "";
  const demoApptId =
    searchParams.get("demo_appointment_id") ??
    (formContext === "demo_booked" ? searchParams.get("appointment_id") : null) ??
    "";

  const [prefetch, setPrefetch] = useState<Prefetch | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setterName, setSetterName] = useState("");
  const [status, setStatus] = useState("showed");
  const [contactPath, setContactPath] = useState("scheduled_intro");
  const [funOutcome, setFunOutcome] = useState("pass");
  const [demoBooked, setDemoBooked] = useState(true);
  const [bookingSource, setBookingSource] = useState("");
  const [bookedAt, setBookedAt] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [qualified, setQualified] = useState<"" | "yes" | "no">("");
  const [motivatorSummary, setMotivatorSummary] = useState("");
  const [objectionsNoted, setObjectionsNoted] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [callRating, setCallRating] = useState("");
  const [improvementNotes, setImprovementNotes] = useState("");
  const [selectedIntroUuid, setSelectedIntroUuid] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string; ghl_sync_status?: string; ghl_sync_error?: string | null } | null>(null);

  useEffect(() => {
    if (!contactId || !token) {
      setLoadError("Invalid link — missing contact_id or token.");
      return;
    }

    const qs = new URLSearchParams({ contact_id: contactId, token, form_context: formContext });
    if (introApptId) qs.set("intro_appointment_id", introApptId);
    if (demoApptId) qs.set("demo_appointment_id", demoApptId);

    fetch(`/api/acquisition/forms/intro-reflection?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((d: Prefetch) => {
        setPrefetch(d);
        if (d.setter_name_default) setSetterName(d.setter_name_default);
        if (d.booking_source_options?.[0]) setBookingSource(d.booking_source_options[0]);
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const demoWhen = d.demo_appointment?.booked_at ?? d.demo_appointment?.scheduled_at;
        setBookedAt(demoWhen ? new Date(demoWhen).toISOString().slice(0, 16) : local);
        setScheduledAt(
          d.demo_appointment?.scheduled_at
            ? new Date(d.demo_appointment.scheduled_at).toISOString().slice(0, 16)
            : local,
        );
        if (d.demo_appointment?.booking_source) setBookingSource(d.demo_appointment.booking_source);
        if (formContext === "demo_booked") setContactPath("demo_booked_prompt");
        if (formContext === "intro_showed") setContactPath("scheduled_intro");
        if (d.intro_candidates?.length === 1) setSelectedIntroUuid(d.intro_candidates[0].id);
        if (d.form_mode === "claim_only") setDemoBooked(true);
      })
      .catch((e) => setLoadError(e.message));
  }, [contactId, token, formContext, introApptId, demoApptId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!contactId || !token || !prefetch) return;

    setSubmitting(true);
    setResult(null);

    const isClaim = prefetch.form_mode === "claim_only";

    try {
      const res = await fetch("/api/acquisition/forms/intro-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          token,
          form_context: formContext,
          form_mode: prefetch.form_mode,
          intro_appointment_id: introApptId || null,
          demo_appointment_id: demoApptId || null,
          intro_appointment_uuid: selectedIntroUuid || null,
          intro_call_id: prefetch.claim_intro_call_id,
          setter_name: setterName,
          status: isClaim ? "showed" : status,
          contact_path: contactPath,
          fun_outcome: isClaim ? "pass" : funOutcome,
          qualified: qualified === "" ? null : qualified === "yes",
          motivator_summary: motivatorSummary || null,
          objections_noted: objectionsNoted || null,
          handoff_notes: handoffNotes || null,
          notes: notes || null,
          demo_booked: isClaim ? true : demoBooked,
          booking_source: bookingSource,
          booked_at: bookedAt ? new Date(bookedAt).toISOString() : null,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          call_rating: !isClaim && callRating ? Number(callRating) : null,
          improvement_notes: !isClaim ? improvementNotes || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setResult({ ok: true, ghl_sync_status: data.ghl_sync_status, ghl_sync_error: data.ghl_sync_error });
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Submit failed" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <p className="text-red-400 font-medium">{loadError}</p>
      </div>
    );
  }

  if (!prefetch) {
    return <p className="text-sm text-slate-500 text-center py-12">Loading form…</p>;
  }

  if (result?.ok) {
    return (
      <div className="max-w-lg mx-auto space-y-4 py-8">
        <h1 className="text-xl font-semibold text-emerald-400">Intro reflection saved</h1>
        <p className="text-sm text-slate-400">
          Logged for <strong className="text-slate-200">{prefetch.lead_name ?? contactId}</strong>.
        </p>
      </div>
    );
  }

  const isClaim = prefetch.form_mode === "claim_only";
  const showFun = !isClaim && status === "showed";
  const showDemoGate = showFun && funOutcome === "pass";

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Acquisition</p>
        <h1 className="text-2xl font-bold text-slate-100">
          {isClaim ? "Claim demo credit" : "Intro call reflection"}
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          {isClaim
            ? "Link this demo to your intro reflection and claim credit."
            : "Reflect on the conversation, qualify, and book or source the demo."}
        </p>
      </div>

      <div className="rounded-xl p-4 mb-6 text-sm" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="font-medium text-slate-200">{prefetch.lead_name ?? "Lead"}</p>
        {prefetch.phone && <p className="text-slate-500 mt-1">{prefetch.phone}</p>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Setter name</span>
          <input required value={setterName} onChange={(e) => setSetterName(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </label>

        {!isClaim && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">How did this conversation happen?</span>
              <select value={contactPath} onChange={(e) => setContactPath(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="scheduled_intro">Scheduled intro on calendar</option>
                <option value="cold_call">Cold call / outbound dial</option>
                <option value="demo_booked_prompt">Demo booked — reflecting now</option>
                <option value="other">Other / follow-up</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-400">Call outcome</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                {OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {!isClaim && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: "#64748b" }}>
              Call review
            </p>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Call rating (1–10)</span>
              <select
                required={status === "showed"}
                value={callRating}
                onChange={(e) => setCallRating(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                <option value="">Select rating…</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Review / what to improve</span>
              <textarea
                value={improvementNotes}
                onChange={(e) => setImprovementNotes(e.target.value)}
                rows={3}
                placeholder="What went well or what would you do differently?"
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
                style={inputStyle}
              />
            </label>
          </>
        )}

        {prefetch.intro_candidates.length > 1 && (
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Which intro led to this demo?</span>
            <select required value={selectedIntroUuid} onChange={(e) => setSelectedIntroUuid(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
              <option value="">Select intro appointment…</option>
              {prefetch.intro_candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.scheduled_at?.slice(0, 16) ?? c.booked_at?.slice(0, 16) ?? c.id.slice(0, 8)} — {c.setter_name ?? "setter"}
                </option>
              ))}
            </select>
          </label>
        )}

        {showFun && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">FUN outcome</span>
              <select value={funOutcome} onChange={(e) => setFunOutcome(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                {FUN_OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-400">Motivator summary (for closer)</span>
              <textarea value={motivatorSummary} onChange={(e) => setMotivatorSummary(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y" style={inputStyle} />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-400">Objections noted</span>
              <textarea value={objectionsNoted} onChange={(e) => setObjectionsNoted(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y" style={inputStyle} />
            </label>
          </>
        )}

        {(showDemoGate || isClaim) && (
          <>
            {!isClaim && (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={demoBooked} onChange={(e) => setDemoBooked(e.target.checked)} />
                Demo booked on this call
              </label>
            )}

            {(demoBooked || isClaim) && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Booking source</span>
                  <select required value={bookingSource} onChange={(e) => setBookingSource(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    {prefetch.booking_source_options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Demo booked at</span>
                  <input type="datetime-local" required value={bookedAt} onChange={(e) => setBookedAt(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Demo scheduled for</span>
                  <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Handoff notes for closer</span>
                  <textarea value={handoffNotes} onChange={(e) => setHandoffNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y" style={inputStyle} />
                </label>
              </>
            )}
          </>
        )}

        <label className="block">
          <span className="text-xs font-medium text-slate-400">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y" style={inputStyle} />
        </label>

        {result?.error && <p className="text-sm text-red-400">{result.error}</p>}

        <button type="submit" disabled={submitting} className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "#f59e0b", color: "#1a1a1a" }}>
          {submitting ? "Saving…" : isClaim ? "Claim demo credit" : "Submit reflection"}
        </button>
      </form>
    </div>
  );
}

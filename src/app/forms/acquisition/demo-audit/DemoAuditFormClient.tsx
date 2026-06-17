"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { REPORTING_TYPE_META, type ReportingType } from "@/lib/reporting-types";
import { SERVICE_PROGRAM_META, type ServiceProgram } from "@/lib/service-program";

const inputStyle: CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

const OFFER_TYPES = ["Core Offer", "Bootcamp", "Mid Offer", "Skool"];

export default function DemoAuditFormClient() {
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contact_id") ?? "";
  const appointmentId = searchParams.get("appointment_id") ?? "";
  const token = searchParams.get("token") ?? "";

  const [leadName, setLeadName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [closerName, setCloserName] = useState("");
  const [setterName, setSetterName] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [transcriptUrl, setTranscriptUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [offerPresented, setOfferPresented] = useState<"" | "yes" | "no">("");
  const [closedOnCall, setClosedOnCall] = useState<"" | "yes" | "no">("");
  const [offerType, setOfferType] = useState("Core Offer");
  const [reportingType, setReportingType] = useState<ReportingType>("RM");
  const [serviceProgram, setServiceProgram] = useState<ServiceProgram>("core");
  const [cashCollected, setCashCollected] = useState("");
  const [disposition, setDisposition] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!contactId || !token) {
      setLoadError("Invalid link — missing contact_id or token.");
      return;
    }
    const qs = new URLSearchParams({ contact_id: contactId, token });
    if (appointmentId) qs.set("appointment_id", appointmentId);

    fetch(`/api/acquisition/forms/demo-audit?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((d) => {
        setLeadName(d.lead_name);
        if (d.closer_name_default) setCloserName(d.closer_name_default);
        if (d.setter_name_default) setSetterName(d.setter_name_default);
      })
      .catch((e) => setLoadError(e.message));
  }, [contactId, token, appointmentId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/acquisition/forms/demo-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          appointment_id: appointmentId || null,
          token,
          closer_name: closerName,
          setter_name: setterName || null,
          recording_url: recordingUrl || null,
          transcript_url: transcriptUrl || null,
          notes: notes || null,
          offer_presented: offerPresented === "yes",
          closed_on_call: closedOnCall === "" ? null : closedOnCall === "yes",
          offer_type: offerType,
          reporting_type: reportingType,
          service_program: serviceProgram,
          cash_collected: cashCollected || null,
          disposition: disposition || null,
          next_step: nextStep || null,
          follow_up_notes: followUpNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setResult({ ok: true });
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Submit failed" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <div className="max-w-lg mx-auto text-center py-12"><p className="text-red-400">{loadError}</p></div>;
  }

  if (result?.ok) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <h1 className="text-xl font-semibold text-emerald-400">Demo audit saved</h1>
        <p className="text-sm text-slate-400 mt-2">Recorded for {leadName ?? contactId}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Acquisition</p>
        <h1 className="text-2xl font-bold text-slate-100">Demo audit</h1>
        <p className="text-sm text-slate-400 mt-2">Post-demo closer disposition, offer, and close.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Closer name</span>
          <input required value={closerName} onChange={(e) => setCloserName(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Setter name</span>
          <input value={setterName} onChange={(e) => setSetterName(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Recording URL</span>
          <input type="url" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Transcript URL</span>
          <input type="url" value={transcriptUrl} onChange={(e) => setTranscriptUrl(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y" style={inputStyle} />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-400">Was an offer presented?</span>
          <select required value={offerPresented} onChange={(e) => setOfferPresented(e.target.value as "" | "yes" | "no")} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        {offerPresented === "no" && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Disposition</span>
              <input value={disposition} onChange={(e) => setDisposition(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} placeholder="follow_up, not_fit, nurture…" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Next step</span>
              <input value={nextStep} onChange={(e) => setNextStep(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </label>
          </>
        )}

        {offerPresented === "yes" && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Did they close on this call?</span>
              <select required value={closedOnCall} onChange={(e) => setClosedOnCall(e.target.value as "" | "yes" | "no")} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            {closedOnCall === "no" && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Offer presented as</span>
                  <select value={offerType} onChange={(e) => setOfferType(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    {OFFER_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Follow-up notes</span>
                  <textarea value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y" style={inputStyle} />
                </label>
              </>
            )}

            {closedOnCall === "yes" && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Client vertical (roster)</span>
                  <select value={reportingType} onChange={(e) => setReportingType(e.target.value as ReportingType)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                    {(Object.keys(REPORTING_TYPE_META) as ReportingType[]).map((t) => (
                      <option key={t} value={t}>{REPORTING_TYPE_META[t].label}</option>
                    ))}
                  </select>
                </label>
                {(reportingType === "RM" || reportingType === "DSCR") && (
                  <label className="block">
                    <span className="text-xs font-medium text-slate-400">Service tier</span>
                    <select value={serviceProgram} onChange={(e) => setServiceProgram(e.target.value as ServiceProgram)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                      {(Object.keys(SERVICE_PROGRAM_META) as ServiceProgram[]).map((p) => (
                        <option key={p} value={p}>{SERVICE_PROGRAM_META[p].label}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Cash collected</span>
                  <input type="number" min="0" step="0.01" value={cashCollected} onChange={(e) => setCashCollected(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                </label>
              </>
            )}
          </>
        )}

        {result?.error && <p className="text-sm text-red-400">{result.error}</p>}

        <button type="submit" disabled={submitting} className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: "#38bdf8", color: "#0f172a" }}>
          {submitting ? "Saving…" : "Submit demo audit"}
        </button>
      </form>
    </div>
  );
}

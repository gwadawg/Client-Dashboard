"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  LEAD_QUALITY_SCORES,
  LOW_LEAD_QUALITY_SCORES,
  ROOT_CAUSE_OBJECTIONS,
  SURFACE_OBJECTIONS,
} from "@/lib/closer-form-config";
import { REPORTING_TYPE_META, type ReportingType } from "@/lib/reporting-types";
import { SERVICE_PROGRAM_META, type ServiceProgram } from "@/lib/service-program";

const inputStyle: CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

const OFFER_TYPES = ["Core Offer", "Bootcamp", "Mid Offer", "Skool"];

const APPT_LABELS: Record<string, string> = {
  demo: "demo",
  bamfam: "BAMFAM",
  followup: "follow-up",
  intro: "intro",
  organic: "organic",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: "#64748b" }}>
      {children}
    </p>
  );
}

export default function CloserFormClient() {
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contact_id") ?? "";
  const appointmentId = searchParams.get("appointment_id") ?? "";
  const token = searchParams.get("token") ?? "";

  const [leadName, setLeadName] = useState<string | null>(null);
  const [appointmentType, setAppointmentType] = useState<string | null>(null);
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
  const [callRating, setCallRating] = useState("");
  const [improvementNotes, setImprovementNotes] = useState("");
  const [leadQualityScore, setLeadQualityScore] = useState("");
  const [leadQualityExplanation, setLeadQualityExplanation] = useState("");
  const [surfaceObjection, setSurfaceObjection] = useState("");
  const [surfaceObjectionOther, setSurfaceObjectionOther] = useState("");
  const [rootCauseObjection, setRootCauseObjection] = useState("");
  const [rootCauseObjectionOther, setRootCauseObjectionOther] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const offerYes = offerPresented === "yes";
  const offerNo = offerPresented === "no";
  const closedYes = closedOnCall === "yes";
  const closedNo = closedOnCall === "no";

  const needsReflection = useMemo(() => {
    if (offerNo) return true;
    if (offerYes && closedNo) return true;
    return false;
  }, [offerYes, offerNo, closedNo]);

  const needsLeadQualityExplanation =
    needsReflection &&
    leadQualityScore !== "" &&
    LOW_LEAD_QUALITY_SCORES.has(leadQualityScore as (typeof LEAD_QUALITY_SCORES)[number]);

  useEffect(() => {
    if (!contactId || !token) {
      setLoadError("Invalid link — missing contact_id or token.");
      return;
    }
    const qs = new URLSearchParams({ contact_id: contactId, token });
    if (appointmentId) qs.set("appointment_id", appointmentId);

    fetch(`/api/acquisition/forms/closer?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((d) => {
        setLeadName(d.lead_name);
        setAppointmentType(d.appointment_type ?? null);
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
      const res = await fetch("/api/acquisition/forms/closer", {
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
          offer_presented: offerYes,
          closed_on_call: offerYes ? (closedYes ? true : closedNo ? false : null) : false,
          offer_type: offerType,
          reporting_type: reportingType,
          service_program: serviceProgram,
          cash_collected: cashCollected || null,
          disposition: disposition || null,
          next_step: nextStep || null,
          follow_up_notes: followUpNotes || null,
          call_rating: needsReflection && callRating ? Number(callRating) : null,
          improvement_notes: needsReflection ? improvementNotes || null : null,
          lead_quality_score: needsReflection ? leadQualityScore || null : null,
          lead_quality_explanation: needsReflection ? leadQualityExplanation || null : null,
          surface_objection: needsReflection ? surfaceObjection || null : null,
          surface_objection_other: needsReflection ? surfaceObjectionOther || null : null,
          root_cause_objection: needsReflection ? rootCauseObjection || null : null,
          root_cause_objection_other: needsReflection ? rootCauseObjectionOther || null : null,
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

  const apptLabel = appointmentType
    ? APPT_LABELS[appointmentType] ?? appointmentType
    : "sales";

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <p className="text-red-400">{loadError}</p>
      </div>
    );
  }

  if (result?.ok) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <h1 className="text-xl font-semibold text-emerald-400">Closer form saved</h1>
        <p className="text-sm text-slate-400 mt-2">Recorded for {leadName ?? contactId}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Acquisition</p>
        <h1 className="text-2xl font-bold text-slate-100">Closer form</h1>
        <p className="text-sm text-slate-400 mt-2">
          Log call outcome for this {apptLabel} appointment.
          {needsReflection
            ? " Reflection is required when the deal did not close on this call."
            : closedYes
              ? " No reflection needed — deal closed on this call."
              : null}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <SectionTitle>Call context</SectionTitle>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Closer name</span>
          <input
            required
            value={closerName}
            onChange={(e) => setCloserName(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Setter name</span>
          <input
            value={setterName}
            onChange={(e) => setSetterName(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Recording URL</span>
          <input
            type="url"
            value={recordingUrl}
            onChange={(e) => setRecordingUrl(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Transcript URL</span>
          <input
            type="url"
            value={transcriptUrl}
            onChange={(e) => setTranscriptUrl(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
            style={inputStyle}
          />
        </label>

        <SectionTitle>Outcome</SectionTitle>
        <label className="block">
          <span className="text-xs font-medium text-slate-400">Was an offer presented?</span>
          <select
            required
            value={offerPresented}
            onChange={(e) => {
              setOfferPresented(e.target.value as "" | "yes" | "no");
              if (e.target.value !== "yes") setClosedOnCall("");
            }}
            className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        {offerNo && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Disposition</span>
              <input
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
                placeholder="follow_up, not_fit, nurture…"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Next step</span>
              <input
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </label>
          </>
        )}

        {offerYes && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Did they close on this call?</span>
              <select
                required
                value={closedOnCall}
                onChange={(e) => setClosedOnCall(e.target.value as "" | "yes" | "no")}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            {closedNo && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Offer presented as</span>
                  <select
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={inputStyle}
                  >
                    {OFFER_TYPES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Follow-up notes</span>
                  <textarea
                    value={followUpNotes}
                    onChange={(e) => setFollowUpNotes(e.target.value)}
                    rows={2}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
                    style={inputStyle}
                  />
                </label>
              </>
            )}

            {closedYes && (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Client vertical (roster)</span>
                  <select
                    value={reportingType}
                    onChange={(e) => setReportingType(e.target.value as ReportingType)}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={inputStyle}
                  >
                    {(Object.keys(REPORTING_TYPE_META) as ReportingType[]).map((t) => (
                      <option key={t} value={t}>
                        {REPORTING_TYPE_META[t].label}
                      </option>
                    ))}
                  </select>
                </label>
                {(reportingType === "RM" || reportingType === "DSCR") && (
                  <label className="block">
                    <span className="text-xs font-medium text-slate-400">Service tier</span>
                    <select
                      value={serviceProgram}
                      onChange={(e) => setServiceProgram(e.target.value as ServiceProgram)}
                      className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    >
                      {(Object.keys(SERVICE_PROGRAM_META) as ServiceProgram[]).map((p) => (
                        <option key={p} value={p}>
                          {SERVICE_PROGRAM_META[p].label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="text-xs font-medium text-slate-400">Cash collected</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashCollected}
                    onChange={(e) => setCashCollected(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={inputStyle}
                  />
                </label>
              </>
            )}
          </>
        )}

        {needsReflection && (
          <>
            <SectionTitle>Call reflection</SectionTitle>
            <p className="text-xs" style={{ color: "#64748b" }}>
              Required when the deal did not close on this call.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Rate this call (1–10)</span>
              <select
                required
                value={callRating}
                onChange={(e) => setCallRating(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                <option value="">—</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">
                What could you improve on next call?
              </span>
              <textarea
                required
                value={improvementNotes}
                onChange={(e) => setImprovementNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
                style={inputStyle}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Lead quality score</span>
              <select
                required
                value={leadQualityScore}
                onChange={(e) => setLeadQualityScore(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                <option value="">—</option>
                {LEAD_QUALITY_SCORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {needsLeadQualityExplanation && (
              <label className="block">
                <span className="text-xs font-medium text-slate-400">
                  Why this lead quality score?
                </span>
                <textarea
                  required
                  value={leadQualityExplanation}
                  onChange={(e) => setLeadQualityExplanation(e.target.value)}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
                  style={inputStyle}
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-slate-400">
                Surface objection
              </span>
              <span className="block text-[10px] mt-0.5" style={{ color: "#64748b" }}>
                What they told you
              </span>
              <select
                required
                value={surfaceObjection}
                onChange={(e) => setSurfaceObjection(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                <option value="">—</option>
                {SURFACE_OBJECTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            {surfaceObjection === "Other" && (
              <label className="block">
                <span className="text-xs font-medium text-slate-400">Surface objection (other)</span>
                <input
                  required
                  value={surfaceObjectionOther}
                  onChange={(e) => setSurfaceObjectionOther(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-slate-400">Root cause objection</span>
              <span className="block text-[10px] mt-0.5" style={{ color: "#64748b" }}>
                What actually blocked the sale
              </span>
              <select
                required
                value={rootCauseObjection}
                onChange={(e) => setRootCauseObjection(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              >
                <option value="">—</option>
                {ROOT_CAUSE_OBJECTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            {rootCauseObjection === "Other" && (
              <label className="block">
                <span className="text-xs font-medium text-slate-400">Root cause (other)</span>
                <input
                  required
                  value={rootCauseObjectionOther}
                  onChange={(e) => setRootCauseObjectionOther(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
              </label>
            )}
          </>
        )}

        {result?.error && <p className="text-sm text-red-400">{result.error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: "#38bdf8", color: "#0f172a" }}
        >
          {submitting ? "Saving…" : "Submit closer form"}
        </button>
      </form>
    </div>
  );
}

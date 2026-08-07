"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { computeContactRatePct } from "@/lib/lead-source-roi/contact-rate";

const PANEL = "#0a1628";
const INPUT_BG = "#0f2040";
const MUTED = "#64748b";
const LABEL = "#94a3b8";
const TEXT = "#e2e8f0";
const AMBER = "#f59e0b";
const GOOD = "#22c55e";
const BORDER = "1px solid rgba(255,255,255,0.08)";

export type ContactRateHelperProps = {
  open: boolean;
  onClose: () => void;
  /** Prefill total leads (e.g. from Current column). */
  initialLeads?: number;
  onApply: (contactRatePct: number) => void;
};

function CountInput({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium mb-1.5" style={{ color: LABEL }}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full py-2.5 px-3 rounded-lg text-sm font-medium outline-none tabular-nums"
        style={{
          background: INPUT_BG,
          border: "1px solid rgba(255,255,255,0.12)",
          color: TEXT,
        }}
      />
      {hint && (
        <p className="text-[11px] mt-1 leading-snug" style={{ color: MUTED }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Educational contact-rate helper for LOs.
 * Contact = real live (phone) conversation, not texts or opt-outs.
 */
export default function ContactRateHelperModal({
  open,
  onClose,
  initialLeads,
  onApply,
}: ContactRateHelperProps) {
  const titleId = useId();
  const [leadsStr, setLeadsStr] = useState("");
  const [spokenStr, setSpokenStr] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initialLeads != null && initialLeads > 0) {
      setLeadsStr(String(Math.round(initialLeads)));
    }
  }, [open, initialLeads]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const totalLeads = Number(leadsStr) || 0;
  const spokenTo = Number(spokenStr) || 0;
  const ratePct = useMemo(
    () => computeContactRatePct(totalLeads, spokenTo),
    [totalLeads, spokenTo],
  );
  const overLimit = spokenTo > totalLeads && totalLeads > 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close contact rate helper"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{ background: "#0c1528", border: BORDER }}
      >
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4"
          style={{
            background: "rgba(12,21,40,0.96)",
            borderBottom: BORDER,
          }}
        >
          <div>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
              Pipeline helper
            </p>
            <h2 id={titleId} className="text-lg font-semibold" style={{ color: TEXT }}>
              Calculate your contact rate
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-2 py-1 rounded-lg shrink-0"
            style={{ color: LABEL, border: BORDER }}
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <section className="rounded-xl p-4 space-y-2" style={{ background: PANEL, border: BORDER }}>
            <h3 className="text-sm font-semibold" style={{ color: AMBER }}>
              Why this number matters
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
              You can buy the cheapest leads on the planet —{" "}
              <strong style={{ color: TEXT }}>if you never actually speak with them, it does not matter</strong>.
              A live conversation is the only way you get a real shot at closing.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: LABEL }}>
              Contact rate is the share of leads you got on the phone with. We measure Waiz the same way —
              so your bake-off is honest only if this rate is accurate.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold" style={{ color: TEXT }}>
              What counts as a contact
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: LABEL }}>
              <strong style={{ color: TEXT }}>Phone conversation only</strong> — you were live with the prospect
              and could attempt to advance the file. That is the bar we use on Waiz too.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
              <div
                className="rounded-lg p-3"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
              >
                <p className="font-medium mb-1.5" style={{ color: GOOD }}>
                  Count these
                </p>
                <ul className="space-y-1 list-disc pl-4" style={{ color: "#cbd5e1" }}>
                  <li>Spoke live on the phone</li>
                  <li>Live transfer / connected call</li>
                  <li>Shown / took intro on a call with you</li>
                  <li>Any CRM stage that means you talked (not texted)</li>
                </ul>
              </div>
              <div
                className="rounded-lg p-3"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <p className="font-medium mb-1.5" style={{ color: "#f87171" }}>
                  Do not count these
                </p>
                <ul className="space-y-1 list-disc pl-4" style={{ color: "#cbd5e1" }}>
                  <li>Text / SMS replies only</li>
                  <li>Stop / DNC / opt-out</li>
                  <li>No answer, VM, wrong number</li>
                  <li>“Contacted” that never had a call</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-xl p-4 space-y-2" style={{ background: PANEL, border: BORDER }}>
            <h3 className="text-sm font-semibold" style={{ color: TEXT }}>
              How to pull this from your CRM
            </h3>
            <ol className="text-sm space-y-2 list-decimal pl-5" style={{ color: "#cbd5e1" }}>
              <li>Pick a clean window — ideally the last full month of leads.</li>
              <li>
                <strong style={{ color: TEXT }}>Total leads:</strong> count every new lead generated in that window.
              </li>
              <li>
                <strong style={{ color: TEXT }}>Spoken to:</strong> count leads dispositioned to stages where you
                actually had a phone conversation (see list above). Exclude stop and text-only outcomes.
              </li>
              <li>
                Enter both numbers below. Accuracy here is clarity — a fuzzy rate makes the whole funnel look wrong.
              </li>
            </ol>
            <p className="text-[12px] leading-snug pt-1" style={{ color: MUTED }}>
              Tip: if your CRM lumps “contacted” with texts and calls, only count records you know had a live call.
              Better to under-count conversations slightly than inflate contact rate with SMS noise.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: TEXT }}>
              Your numbers
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CountInput
                id="cr-leads"
                label="Total leads (period)"
                value={leadsStr}
                onChange={setLeadsStr}
                hint="e.g. last 30 days of new leads"
              />
              <CountInput
                id="cr-spoken"
                label="Spoken with on the phone"
                value={spokenStr}
                onChange={setSpokenStr}
                hint="Live call conversations only"
              />
            </div>

            <div
              className="rounded-xl px-4 py-4"
              style={{
                background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(10,22,40,0.95))",
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
                Contact rate
              </p>
              <p className="text-3xl font-semibold tabular-nums mt-1" style={{ color: AMBER }}>
                {ratePct == null ? "—" : `${ratePct.toFixed(1)}%`}
              </p>
              <p className="text-[12px] mt-1.5" style={{ color: LABEL }}>
                {ratePct == null
                  ? "Enter leads and people you spoke with."
                  : `= ${spokenTo.toLocaleString()} spoken ÷ ${totalLeads.toLocaleString()} leads`}
              </p>
              {overLimit && (
                <p className="text-[12px] mt-2" style={{ color: "#f87171" }}>
                  Spoken-to cannot exceed total leads. Check your CRM counts.
                </p>
              )}
            </div>
          </section>

          <div className="flex flex-col sm:flex-row gap-2 pb-2">
            <button
              type="button"
              disabled={ratePct == null || overLimit}
              onClick={() => {
                if (ratePct == null || overLimit) return;
                onApply(Math.round(ratePct * 10) / 10);
                onClose();
              }}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{
                background: "rgba(245,158,11,0.2)",
                border: "1px solid rgba(245,158,11,0.45)",
                color: AMBER,
              }}
            >
              Use this rate on Current
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ color: LABEL, border: BORDER }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

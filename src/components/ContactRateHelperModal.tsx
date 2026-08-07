"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { computeContactRatePct } from "@/lib/lead-source-roi/contact-rate";
import { BORDER, R, T } from "@/lib/lead-source-roi/theme";

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
      <label
        htmlFor={id}
        className="block text-[10px] font-semibold uppercase mb-1.5"
        style={{ color: T.mid, letterSpacing: "0.1em" }}
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
        className="lsr-data w-full py-2.5 px-3 text-[15px] font-medium outline-none"
        style={{
          background: T.input,
          border: BORDER,
          borderRadius: R,
          color: T.hi,
        }}
      />
      {hint && (
        <p className="text-[10px] mt-1.5 leading-snug" style={{ color: T.low }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  boxed,
}: {
  title: string;
  children: React.ReactNode;
  boxed?: boolean;
}) {
  return (
    <section
      className={boxed ? "p-4 space-y-2" : "space-y-2"}
      style={boxed ? { background: T.panel, border: BORDER, borderRadius: R } : undefined}
    >
      <h3
        className="text-[10px] font-semibold uppercase"
        style={{ color: T.amber, letterSpacing: "0.13em" }}
      >
        {title}
      </h3>
      {children}
    </section>
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

  // Seed the lead count on each open, adjusting state during render rather
  // than in an effect so there's no flash of the stale value.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && initialLeads != null && initialLeads > 0) {
      setLeadsStr(String(Math.round(initialLeads)));
    }
  }

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
      className="lsr fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close contact rate helper"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl"
        style={{
          background: T.base,
          border: `1px solid ${T.ruleStrong}`,
          borderRadius: R,
        }}
      >
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4"
          style={{ background: T.base, borderBottom: `1px solid ${T.rule}` }}
        >
          <div>
            <span
              className="text-[10px] font-semibold uppercase"
              style={{ color: T.amber, letterSpacing: "0.13em" }}
            >
              Pipeline helper
            </span>
            <h2
              id={titleId}
              className="text-[18px] font-bold mt-1"
              style={{ color: T.hi, letterSpacing: "-0.01em" }}
            >
              Calculate your contact rate
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-semibold uppercase px-2.5 py-1.5 shrink-0"
            style={{
              color: T.mid,
              border: BORDER,
              borderRadius: R,
              letterSpacing: "0.08em",
            }}
          >
            Close
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <Section title="Why this number matters" boxed>
            <p className="text-[13px] leading-relaxed" style={{ color: T.hi }}>
              You can buy the cheapest leads on the planet —{" "}
              <strong style={{ color: T.amber }}>
                if you never actually speak with them, it does not matter
              </strong>
              . A live conversation is the only way you get a real shot at closing.
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: T.mid }}>
              Contact rate is the share of leads you got on the phone with. We measure Waiz
              the same way — so your bake-off is honest only if this rate is accurate.
            </p>
          </Section>

          <Section title="What counts as a contact">
            <p className="text-[13px] leading-relaxed" style={{ color: T.mid }}>
              <strong style={{ color: T.hi }}>Phone conversation only</strong> — you were
              live with the prospect and could attempt to advance the file. That is the bar
              we use on Waiz too.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
              <div
                className="p-3"
                style={{
                  background: T.goodSoft,
                  border: `1px solid ${T.goodLine}`,
                  borderRadius: R,
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase mb-2"
                  style={{ color: T.good, letterSpacing: "0.1em" }}
                >
                  Count these
                </p>
                <ul className="space-y-1.5" style={{ color: T.hi }}>
                  <li>Spoke live on the phone</li>
                  <li>Live transfer / connected call</li>
                  <li>Shown / took intro on a call</li>
                  <li>Any CRM stage that means you talked</li>
                </ul>
              </div>
              <div
                className="p-3"
                style={{
                  background: "rgba(248,113,113,0.06)",
                  border: "1px solid rgba(248,113,113,0.24)",
                  borderRadius: R,
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase mb-2"
                  style={{ color: T.bad, letterSpacing: "0.1em" }}
                >
                  Do not count these
                </p>
                <ul className="space-y-1.5" style={{ color: T.hi }}>
                  <li>Text / SMS replies only</li>
                  <li>Stop / DNC / opt-out</li>
                  <li>No answer, VM, wrong number</li>
                  <li>&ldquo;Contacted&rdquo; with no call</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section title="How to pull this from your CRM" boxed>
            <ol
              className="text-[13px] space-y-2 list-decimal pl-5 leading-relaxed"
              style={{ color: T.mid }}
            >
              <li>Pick a clean window — ideally the last full month of leads.</li>
              <li>
                <strong style={{ color: T.hi }}>Total leads:</strong> count every new lead
                generated in that window.
              </li>
              <li>
                <strong style={{ color: T.hi }}>Spoken to:</strong> count leads
                dispositioned to stages where you actually had a phone conversation. Exclude
                stop and text-only outcomes.
              </li>
              <li>
                Enter both below. Accuracy here is clarity — a fuzzy rate makes the whole
                funnel look wrong.
              </li>
            </ol>
            <p className="text-[11px] leading-snug pt-1" style={{ color: T.low }}>
              Tip: if your CRM lumps &ldquo;contacted&rdquo; with texts and calls, only count
              records you know had a live call. Better to under-count slightly than to
              inflate contact rate with SMS noise.
            </p>
          </Section>

          <Section title="Your numbers">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <CountInput
                id="cr-leads"
                label="Total leads"
                value={leadsStr}
                onChange={setLeadsStr}
                hint="e.g. last 30 days of new leads"
              />
              <CountInput
                id="cr-spoken"
                label="Spoken with"
                value={spokenStr}
                onChange={setSpokenStr}
                hint="Live call conversations only"
              />
            </div>

            <div
              className="px-4 py-4 mt-1"
              style={{
                background: T.amberSoft,
                border: `1px solid ${T.amberLine}`,
                borderRadius: R,
              }}
            >
              <span
                className="text-[10px] font-semibold uppercase"
                style={{ color: T.low, letterSpacing: "0.13em" }}
              >
                Contact rate
              </span>
              <p
                className="lsr-data text-[34px] font-semibold mt-1 leading-none"
                style={{ color: T.amber }}
              >
                {ratePct == null ? "—" : `${ratePct.toFixed(1)}%`}
              </p>
              <p className="text-[11px] mt-2" style={{ color: T.mid }}>
                {ratePct == null
                  ? "Enter leads and people you spoke with."
                  : `${spokenTo.toLocaleString()} spoken ÷ ${totalLeads.toLocaleString()} leads`}
              </p>
              {overLimit && (
                <p className="text-[11px] mt-2" style={{ color: T.bad }}>
                  Spoken-to cannot exceed total leads. Check your CRM counts.
                </p>
              )}
            </div>
          </Section>

          <div className="flex flex-col sm:flex-row gap-2 pb-1">
            <button
              type="button"
              disabled={ratePct == null || overLimit}
              onClick={() => {
                if (ratePct == null || overLimit) return;
                onApply(Math.round(ratePct * 10) / 10);
                onClose();
              }}
              className="flex-1 px-4 py-2.5 text-[12px] font-bold uppercase disabled:opacity-35 transition-colors hover:brightness-125"
              style={{
                background: T.amberSoft,
                border: `1px solid ${T.amberLine}`,
                borderRadius: R,
                color: T.amber,
                letterSpacing: "0.08em",
              }}
            >
              Use this rate
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-[12px] font-semibold uppercase"
              style={{
                color: T.mid,
                border: BORDER,
                borderRadius: R,
                letterSpacing: "0.08em",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

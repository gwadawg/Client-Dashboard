"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  BTN_PRIMARY_BG,
  FONT_BODY,
  FONT_DISPLAY,
  WAIZ,
  WaizWordmark,
} from "@/components/onboarding/brand";
import LeadSearchField, { type LeadHit } from "@/components/loan-log/LeadSearchField";
import { DQ_REASONS, type DqReasonSlug } from "@/lib/dq-reasons";
import { LOAN_LOG_STAGES, loanLogStageLabel, type LoanLogStage } from "@/lib/loan-log-form";

type Props = { token: string };

type LogType = "conversion" | "dq";

const INPUT: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: `1px solid ${WAIZ.line}`,
  background: WAIZ.white,
  padding: "12px 14px",
  fontSize: 15,
  color: WAIZ.ink,
  outline: "none",
};

const TEXTAREA: CSSProperties = {
  ...INPUT,
  minHeight: 96,
  resize: "vertical" as const,
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function chipStyle(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? WAIZ.accent : WAIZ.line}`,
    background: active ? WAIZ.tint : WAIZ.soft,
    color: WAIZ.navy,
  };
}

export default function LoanLogForm({ token }: Props) {
  const [clientName, setClientName] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [logType, setLogType] = useState<LogType>("conversion");
  const [stage, setStage] = useState<LoanLogStage | "">("");
  const [picked, setPicked] = useState<LeadHit | null>(null);
  const [cantFind, setCantFind] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso);
  const [loanSize, setLoanSize] = useState("");
  const [transactionLabel, setTransactionLabel] = useState("");
  const [commission, setCommission] = useState("");
  const [dqReasons, setDqReasons] = useState<DqReasonSlug[]>([]);
  const [dqOther, setDqOther] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ lead_name: string; log_type: LogType; stage?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/forms/loans/${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setInvalid(true);
          return;
        }
        setClientName(typeof data.client_name === "string" ? data.client_name : "Your office");
      })
      .catch(() => {
        if (!cancelled) setInvalid(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const reset = useCallback(() => {
    setLogType("conversion");
    setStage("");
    setPicked(null);
    setCantFind(false);
    setNewName("");
    setNewPhone("");
    setOccurredOn(todayIso());
    setLoanSize("");
    setTransactionLabel("");
    setCommission("");
    setDqReasons([]);
    setDqOther("");
    setNotes("");
    setError(null);
    setDone(null);
  }, []);

  const leadLabel = useMemo(() => {
    if (cantFind) return newName.trim();
    return picked?.lead_name ?? "";
  }, [cantFind, newName, picked]);

  function toggleDqReason(slug: DqReasonSlug) {
    setDqReasons(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (logType === "conversion" && !stage) {
      setError("Choose Proposal, Submitted, or Funded.");
      return;
    }

    if (logType === "dq") {
      if (dqReasons.length === 0) {
        setError("Select at least one reason.");
        return;
      }
      if (dqReasons.includes("other") && !dqOther.trim()) {
        setError("Describe the other reason.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        log_type: logType,
        occurred_on: occurredOn,
        cant_find: cantFind,
        lead_name: cantFind ? newName : picked?.lead_name,
        lead_phone: cantFind ? newPhone : picked?.lead_phone,
        ghl_contact_id: cantFind ? undefined : picked?.ghl_contact_id,
      };

      if (logType === "conversion") {
        payload.stage = stage;
        payload.loan_size = loanSize;
        payload.transaction_label = transactionLabel || undefined;
        if (stage === "funded") payload.commission_amount = commission;
      } else {
        payload.dq_reasons = dqReasons;
        if (dqReasons.includes("other")) payload.dq_other = dqOther;
        if (notes.trim()) payload.notes = notes.trim();
      }

      const res = await fetch(`/api/forms/loans/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't save. Try again.");
        return;
      }
      setDone({
        lead_name: typeof data.lead_name === "string" ? data.lead_name : leadLabel,
        log_type: logType,
        stage: typeof data.stage === "string" ? data.stage : undefined,
      });
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (invalid) {
    return (
      <div className="min-h-full flex items-center justify-center px-4" style={{ fontFamily: FONT_BODY }}>
        <div className="max-w-md text-center space-y-3">
          <WaizWordmark height={28} color={WAIZ.navy} />
          <p className="text-lg font-semibold" style={{ color: WAIZ.ink }}>
            This link isn’t valid. Ask your Waiz contact for a new one.
          </p>
        </div>
      </div>
    );
  }

  if (!clientName) {
    return (
      <p className="text-center py-24 text-sm" style={{ color: WAIZ.muted, fontFamily: FONT_BODY }}>
        Loading…
      </p>
    );
  }

  if (done) {
    const successMessage =
      done.log_type === "dq"
        ? `${done.lead_name} — Disqualified logged.`
        : `${done.lead_name} — ${loanLogStageLabel(done.stage ?? "")}. Same borrower, another transaction? Log it next.`;

    return (
      <div className="min-h-full flex items-center justify-center px-4" style={{ fontFamily: FONT_BODY }}>
        <div
          className="w-full max-w-md rounded-2xl p-8 space-y-5"
          style={{ background: WAIZ.white, boxShadow: "0 18px 50px -22px rgba(6,26,74,.35)" }}
        >
          <WaizWordmark height={24} color={WAIZ.navy} />
          <h1 className="text-2xl font-semibold" style={{ fontFamily: FONT_DISPLAY, color: WAIZ.navy }}>
            Logged
          </h1>
          <p style={{ color: WAIZ.muted }}>{successMessage}</p>
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl py-3 text-sm font-semibold text-white"
            style={{ background: BTN_PRIMARY_BG }}
          >
            Log another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-4 py-10" style={{ fontFamily: FONT_BODY }}>
      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-md rounded-2xl p-6 sm:p-8 space-y-5"
        style={{ background: WAIZ.white, boxShadow: "0 18px 50px -22px rgba(6,26,74,.35)" }}
      >
        <div className="space-y-2">
          <WaizWordmark height={24} color={WAIZ.navy} />
          <h1 className="text-2xl font-semibold leading-tight" style={{ fontFamily: FONT_DISPLAY, color: WAIZ.navy }}>
            {clientName} — Log activity
          </h1>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium" style={{ color: WAIZ.ink }}>
            What are you logging?
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: "conversion" as const, label: "Conversion" },
                { value: "dq" as const, label: "Disqualified" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setLogType(value)}
                className="rounded-xl py-3 text-sm font-semibold transition-colors"
                style={chipStyle(logType === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <LeadSearchField
          token={token}
          inputStyle={INPUT}
          picked={picked}
          onPickedChange={setPicked}
          cantFind={cantFind}
          onCantFindChange={setCantFind}
          newName={newName}
          onNewNameChange={setNewName}
          newPhone={newPhone}
          onNewPhoneChange={setNewPhone}
        />

        <label className="block space-y-2">
          <span className="text-sm font-medium" style={{ color: WAIZ.ink }}>When</span>
          <input
            type="date"
            style={INPUT}
            value={occurredOn}
            onChange={e => setOccurredOn(e.target.value)}
            required
          />
        </label>

        <div
          className="space-y-5 transition-opacity duration-200"
          style={{ opacity: 1 }}
        >
          {logType === "conversion" ? (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium" style={{ color: WAIZ.ink }}>
                  What happened?
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {LOAN_LOG_STAGES.map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStage(value)}
                      className="rounded-xl py-3 text-xs sm:text-sm font-semibold"
                      style={chipStyle(stage === value)}
                    >
                      {loanLogStageLabel(value)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block space-y-2">
                <span className="text-sm font-medium" style={{ color: WAIZ.ink }}>Loan size</span>
                <input
                  style={INPUT}
                  inputMode="decimal"
                  placeholder="250000"
                  value={loanSize}
                  onChange={e => setLoanSize(e.target.value)}
                  required={logType === "conversion"}
                />
              </label>

              {(stage === "submitted" || stage === "funded") && (
                <label className="block space-y-2">
                  <span className="text-sm font-medium" style={{ color: WAIZ.ink }}>Transaction</span>
                  <input
                    style={INPUT}
                    placeholder="Optional — 1st loan, cash-out, address"
                    value={transactionLabel}
                    onChange={e => setTransactionLabel(e.target.value)}
                  />
                  <span className="block text-xs" style={{ color: WAIZ.muted }}>
                    One submit per loan. Same house, two loans = two submits. Name it if two files are the same size the same day.
                  </span>
                </label>
              )}

              {stage === "funded" && (
                <label className="block space-y-2">
                  <span className="text-sm font-medium" style={{ color: WAIZ.ink }}>What you made</span>
                  <input
                    style={INPUT}
                    inputMode="decimal"
                    placeholder="Optional"
                    value={commission}
                    onChange={e => setCommission(e.target.value)}
                  />
                  <span className="block text-xs" style={{ color: WAIZ.muted }}>
                    Only if you want ROAS on your dashboard. You can skip this.
                  </span>
                </label>
              )}
            </>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium" style={{ color: WAIZ.ink }}>
                  Why not qualified?
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {DQ_REASONS.map(({ slug, label }) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => toggleDqReason(slug)}
                      className="rounded-xl py-3 text-xs sm:text-sm font-semibold text-left px-3"
                      style={chipStyle(dqReasons.includes(slug))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {dqReasons.includes("other") && (
                <label className="block space-y-2">
                  <span className="text-sm font-medium" style={{ color: WAIZ.ink }}>Other reason</span>
                  <input
                    style={INPUT}
                    placeholder="Describe why this lead wasn't qualified"
                    value={dqOther}
                    onChange={e => setDqOther(e.target.value)}
                    required
                  />
                </label>
              )}

              <label className="block space-y-2">
                <span className="text-sm font-medium" style={{ color: WAIZ.ink }}>Notes</span>
                <textarea
                  style={TEXTAREA}
                  placeholder="Optional — property details, conversation context"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </label>
            </>
          )}
        </div>

        {error && (
          <p className="text-sm" style={{ color: "#b42318" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: BTN_PRIMARY_BG }}
        >
          {submitting ? "Saving…" : "Submit"}
        </button>
      </form>
    </div>
  );
}

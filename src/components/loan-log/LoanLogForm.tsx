"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  BTN_PRIMARY_BG,
  FONT_BODY,
  FONT_DISPLAY,
  WAIZ,
  WaizWordmark,
} from "@/components/onboarding/brand";
import LeadSearchField, { type LeadHit } from "@/components/loan-log/LeadSearchField";
import { DQ_REASONS, type DqReasonSlug } from "@/lib/dq-reasons";
import {
  formatDealPickerLabel,
  formatMoney,
  loanSizeInputValue,
  type LeadContext,
  type LeadContextDeal,
} from "@/lib/loan-log-lead-context";
import {
  formatTransactionLabel,
  TRANSACTION_TYPES,
  type TransactionTypeSlug,
} from "@/lib/transaction-types";
import { LOAN_LOG_STAGES, loanLogStageLabel, type LoanLogStage } from "@/lib/loan-log-form";

type Props = {
  token: string;
  embedded?: boolean;
  clientName?: string;
  onLogged?: () => void;
};

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

function leadContextQuery(
  picked: LeadHit | null,
  cantFind: boolean,
  newPhone: string,
): string | null {
  if (picked) {
    const params = new URLSearchParams();
    if (picked.ghl_contact_id) params.set("ghl_contact_id", picked.ghl_contact_id);
    if (picked.lead_phone?.trim()) params.set("phone", picked.lead_phone.trim());
    return params.toString() || null;
  }
  if (cantFind && newPhone.trim()) {
    return new URLSearchParams({ phone: newPhone.trim() }).toString();
  }
  return null;
}

export default function LoanLogForm({ token, embedded, clientName: clientNameProp, onLogged }: Props) {
  const [clientNameLocal, setClientNameLocal] = useState<string | null>(
    embedded && clientNameProp ? clientNameProp : null,
  );
  const clientName = embedded && clientNameProp ? clientNameProp : clientNameLocal;
  const [invalid, setInvalid] = useState(false);
  const [logType, setLogType] = useState<LogType>("conversion");
  const [stage, setStage] = useState<LoanLogStage | "">("");
  const [picked, setPicked] = useState<LeadHit | null>(null);
  const [cantFind, setCantFind] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso);
  const [loanSize, setLoanSize] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionTypeSlug | "">("");
  const [transactionOther, setTransactionOther] = useState("");
  const [commission, setCommission] = useState("");
  const [dqReasons, setDqReasons] = useState<DqReasonSlug[]>([]);
  const [dqOther, setDqOther] = useState("");
  const [notes, setNotes] = useState("");
  const [leadContext, setLeadContext] = useState<LeadContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [fundedManualMode, setFundedManualMode] = useState(false);
  const [loanFieldsTouched, setLoanFieldsTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ lead_name: string; log_type: LogType; stage?: string } | null>(null);
  const applyContextRef = useRef<(ctx: LeadContext | null, nextStage: LoanLogStage | "") => void>(() => {});

  applyContextRef.current = (ctx, nextStage) => {
    if (loanFieldsTouched || !ctx) return;

    if (nextStage === "submitted" && ctx.proposal_loan_size != null) {
      setLoanSize(loanSizeInputValue(ctx.proposal_loan_size));
    }

    if (nextStage === "funded") {
      if (ctx.open_deals.length === 1) {
        setSelectedDealId(ctx.open_deals[0].id);
        setFundedManualMode(false);
      } else if (ctx.open_deals.length === 0) {
        setSelectedDealId(null);
        setFundedManualMode(true);
      } else {
        setSelectedDealId(null);
        setFundedManualMode(false);
      }
    }
  };

  const resetLeadDerivedState = useCallback(() => {
    setLeadContext(null);
    setContextError(false);
    setSelectedDealId(null);
    setFundedManualMode(false);
    setLoanFieldsTouched(false);
    setLoanSize("");
    setTransactionType("");
    setTransactionOther("");
  }, []);

  useEffect(() => {
    if (embedded && clientNameProp) return;
    let cancelled = false;
    fetch(`/api/forms/loans/${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setInvalid(true);
          return;
        }
        setClientNameLocal(typeof data.client_name === "string" ? data.client_name : "Your office");
      })
      .catch(() => {
        if (!cancelled) setInvalid(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, embedded, clientNameProp]);

  const contextQuery = useMemo(
    () => leadContextQuery(picked, cantFind, newPhone),
    [picked, cantFind, newPhone],
  );

  useEffect(() => {
    if (logType !== "conversion") {
      setLeadContext(null);
      setContextLoading(false);
      setContextError(false);
      return;
    }

    if (!contextQuery) {
      resetLeadDerivedState();
      return;
    }

    let cancelled = false;
    setContextLoading(true);
    setContextError(false);
    resetLeadDerivedState();

    fetch(`/api/forms/loans/${encodeURIComponent(token)}/lead-context?${contextQuery}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLeadContext(null);
          setContextError(true);
          setFundedManualMode(true);
          return;
        }
        const ctx: LeadContext = {
          proposal_loan_size:
            typeof data.proposal_loan_size === "number" ? data.proposal_loan_size : null,
          open_deals: Array.isArray(data.open_deals)
            ? data.open_deals.filter(
                (d: LeadContextDeal) =>
                  d &&
                  typeof d.id === "string" &&
                  typeof d.loan_size === "number" &&
                  typeof d.submitted_at === "string",
              )
            : [],
        };
        setLeadContext(ctx);
      })
      .catch(() => {
        if (cancelled) return;
        setLeadContext(null);
        setContextError(true);
        setFundedManualMode(true);
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contextQuery, logType, token, resetLeadDerivedState]);

  useEffect(() => {
    if (logType !== "conversion" || loanFieldsTouched) return;
    applyContextRef.current(leadContext, stage);
  }, [stage, leadContext, logType, loanFieldsTouched]);

  const reset = useCallback(() => {
    setLogType("conversion");
    setStage("");
    setPicked(null);
    setCantFind(false);
    setNewName("");
    setNewPhone("");
    setOccurredOn(todayIso());
    setLoanSize("");
    setTransactionType("");
    setTransactionOther("");
    setCommission("");
    setDqReasons([]);
    setDqOther("");
    setNotes("");
    setLeadContext(null);
    setContextLoading(false);
    setContextError(false);
    setSelectedDealId(null);
    setFundedManualMode(false);
    setLoanFieldsTouched(false);
    setError(null);
    setDone(null);
  }, []);

  const selectedDeal = useMemo(
    () => leadContext?.open_deals.find(d => d.id === selectedDealId) ?? null,
    [leadContext, selectedDealId],
  );

  const showFundedPicker =
    logType === "conversion" &&
    stage === "funded" &&
    !fundedManualMode &&
    (leadContext?.open_deals.length ?? 0) > 0;

  const showManualLoanFields =
    logType === "conversion" &&
    stage !== "" &&
    (!showFundedPicker || !selectedDeal);

  const showSubmittedPrefillHint =
    stage === "submitted" &&
    !loanFieldsTouched &&
    leadContext?.proposal_loan_size != null &&
    loanSize === loanSizeInputValue(leadContext.proposal_loan_size);

  const leadLabel = useMemo(() => {
    if (cantFind) return newName.trim();
    return picked?.lead_name ?? "";
  }, [cantFind, newName, picked]);

  function handlePickedChange(hit: LeadHit | null) {
    resetLeadDerivedState();
    setPicked(hit);
  }

  function handleCantFindChange(value: boolean) {
    resetLeadDerivedState();
    setCantFind(value);
  }

  function handleStageChange(value: LoanLogStage) {
    setStage(value);
    if (!loanFieldsTouched) {
      setLoanSize("");
      setTransactionType("");
      setTransactionOther("");
      setSelectedDealId(null);
      if (value !== "funded") setFundedManualMode(false);
    }
  }

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

    if (logType === "conversion" && stage === "funded" && showFundedPicker && !selectedDeal) {
      setError("Pick which loan funded.");
      return;
    }

    if (
      logType === "conversion" &&
      (stage === "submitted" || stage === "funded") &&
      showManualLoanFields &&
      transactionType === "other" &&
      !transactionOther.trim()
    ) {
      setError("Describe the transaction type.");
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
        if (selectedDeal && showFundedPicker) {
          payload.loan_size = String(selectedDeal.loan_size);
          payload.transaction_label = selectedDeal.transaction_label || undefined;
        } else {
          payload.loan_size = loanSize;
          const label = formatTransactionLabel(transactionType, transactionOther);
          payload.transaction_label = label || undefined;
        }
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
      onLogged?.();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (invalid && !embedded) {
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

    if (embedded) {
      return (
        <div className="space-y-4 py-2">
          <h2 className="text-xl font-semibold" style={{ fontFamily: FONT_DISPLAY, color: WAIZ.navy }}>
            Logged
          </h2>
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
      );
    }

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

  const formFields = (
    <>
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
          onPickedChange={handlePickedChange}
          cantFind={cantFind}
          onCantFindChange={handleCantFindChange}
          newName={newName}
          onNewNameChange={setNewName}
          newPhone={newPhone}
          onNewPhoneChange={setNewPhone}
        />

        {logType === "conversion" && contextQuery && (
          <p className="text-xs" style={{ color: contextError ? "#b42318" : WAIZ.muted }}>
            {contextLoading
              ? "Checking prior logs…"
              : contextError
                ? "Couldn't load prior logs — enter details manually."
                : null}
          </p>
        )}

        <div className="space-y-5 transition-opacity duration-200">
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
                      onClick={() => handleStageChange(value)}
                      className="rounded-xl py-3 text-xs sm:text-sm font-semibold"
                      style={chipStyle(stage === value)}
                    >
                      {loanLogStageLabel(value)}
                    </button>
                  ))}
                </div>
              </fieldset>

              {showFundedPicker && leadContext && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium" style={{ color: WAIZ.ink }}>
                    Which loan funded?
                  </legend>
                  <div className="space-y-2">
                    {leadContext.open_deals.map(deal => (
                      <button
                        key={deal.id}
                        type="button"
                        onClick={() => setSelectedDealId(deal.id)}
                        className="w-full rounded-xl py-3 px-3 text-left text-xs sm:text-sm font-semibold"
                        style={chipStyle(selectedDealId === deal.id)}
                      >
                        {formatDealPickerLabel(deal)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold"
                    style={{ color: WAIZ.accent700 }}
                    onClick={() => {
                      setFundedManualMode(true);
                      setSelectedDealId(null);
                      setLoanSize("");
                      setTransactionType("");
                      setTransactionOther("");
                      setLoanFieldsTouched(false);
                    }}
                  >
                    Fund a different loan
                  </button>
                </fieldset>
              )}

              {selectedDeal && showFundedPicker && (
                <div
                  className="rounded-xl px-3 py-3 space-y-1"
                  style={{ background: WAIZ.tint, border: `1px solid ${WAIZ.line}` }}
                >
                  <p className="text-sm font-semibold" style={{ color: WAIZ.navy }}>
                    {formatMoney(selectedDeal.loan_size)}
                    {selectedDeal.transaction_label
                      ? ` · ${selectedDeal.transaction_label}`
                      : ""}
                  </p>
                  <p className="text-xs" style={{ color: WAIZ.muted }}>
                    Using the loan size and transaction from your earlier submission.
                  </p>
                </div>
              )}

              {showManualLoanFields && (
                <>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium" style={{ color: WAIZ.ink }}>Loan size</span>
                    <input
                      style={INPUT}
                      inputMode="decimal"
                      placeholder="250000"
                      value={loanSize}
                      onChange={e => {
                        setLoanFieldsTouched(true);
                        setLoanSize(e.target.value);
                      }}
                      required
                    />
                    {showSubmittedPrefillHint && (
                      <span className="block text-xs" style={{ color: WAIZ.muted }}>
                        From your earlier proposal — change if this file is different.
                      </span>
                    )}
                  </label>

                  {(stage === "submitted" || stage === "funded") && (
                    <div className="block space-y-2">
                      <label className="text-sm font-medium" style={{ color: WAIZ.ink }}>
                        Transaction type
                      </label>
                      <select
                        style={INPUT}
                        value={transactionType}
                        onChange={e => {
                          setLoanFieldsTouched(true);
                          const value = e.target.value;
                          setTransactionType(value as TransactionTypeSlug | "");
                          if (value !== "other") setTransactionOther("");
                        }}
                      >
                        <option value="">Optional — select type</option>
                        {TRANSACTION_TYPES.map(({ slug, label }) => (
                          <option key={slug} value={slug}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {transactionType === "other" && (
                        <input
                          style={INPUT}
                          placeholder="Describe the transaction"
                          value={transactionOther}
                          onChange={e => {
                            setLoanFieldsTouched(true);
                            setTransactionOther(e.target.value);
                          }}
                          required
                        />
                      )}
                      <span className="block text-xs" style={{ color: WAIZ.muted }}>
                        One submit per loan. Same house, two loans = two submits. Pick a type if two files are the same size the same day.
                      </span>
                    </div>
                  )}
                </>
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
            </>
          ) : (
            <>
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
    </>
  );

  if (embedded) {
    return (
      <form onSubmit={onSubmit} className="space-y-5">
        {formFields}
      </form>
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
        {formFields}
      </form>
    </div>
  );
}

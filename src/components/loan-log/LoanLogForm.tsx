"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  BTN_PRIMARY_BG,
  FONT_BODY,
  FONT_DISPLAY,
  WAIZ,
  WaizWordmark,
} from "@/components/onboarding/brand";
import { LOAN_LOG_STAGES, loanLogStageLabel, type LoanLogStage } from "@/lib/loan-log-form";

type LeadHit = {
  lead_name: string;
  lead_phone: string;
  ghl_contact_id: string;
};

type Props = { token: string };

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

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function LoanLogForm({ token }: Props) {
  const [clientName, setClientName] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [stage, setStage] = useState<LoanLogStage | "">("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [openList, setOpenList] = useState(false);
  const [picked, setPicked] = useState<LeadHit | null>(null);
  const [cantFind, setCantFind] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso);
  const [loanSize, setLoanSize] = useState("");
  const [transactionLabel, setTransactionLabel] = useState("");
  const [commission, setCommission] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ lead_name: string; stage: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (cantFind || picked || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      fetch(`/api/forms/loans/${encodeURIComponent(token)}/leads?q=${encodeURIComponent(query.trim())}`)
        .then(res => res.json())
        .then(data => {
          setHits(Array.isArray(data.leads) ? data.leads : []);
          setOpenList(true);
        })
        .catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query, token, cantFind, picked]);

  const reset = useCallback(() => {
    setStage("");
    setQuery("");
    setHits([]);
    setPicked(null);
    setCantFind(false);
    setNewName("");
    setNewPhone("");
    setOccurredOn(todayIso());
    setLoanSize("");
    setTransactionLabel("");
    setCommission("");
    setError(null);
    setDone(null);
  }, []);

  const leadLabel = useMemo(() => {
    if (cantFind) return newName.trim();
    return picked?.lead_name ?? "";
  }, [cantFind, newName, picked]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!stage) {
      setError("Choose Proposal, Submitted, or Funded.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/loans/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          occurred_on: occurredOn,
          loan_size: loanSize,
          transaction_label: transactionLabel || undefined,
          commission_amount: stage === "funded" ? commission : undefined,
          cant_find: cantFind,
          lead_name: cantFind ? newName : picked?.lead_name,
          lead_phone: cantFind ? newPhone : picked?.lead_phone,
          ghl_contact_id: cantFind ? undefined : picked?.ghl_contact_id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Couldn't save. Try again.");
        return;
      }
      setDone({
        lead_name: typeof data.lead_name === "string" ? data.lead_name : leadLabel,
        stage,
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
          <p style={{ color: WAIZ.muted }}>
            {done.lead_name} — {loanLogStageLabel(done.stage)}. Same borrower, another transaction? Log it next.
          </p>
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
            {clientName} — Log a loan
          </h1>
        </div>

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
                style={{
                  border: `1px solid ${stage === value ? WAIZ.accent : WAIZ.line}`,
                  background: stage === value ? WAIZ.tint : WAIZ.soft,
                  color: WAIZ.navy,
                }}
              >
                {loanLogStageLabel(value)}
              </button>
            ))}
          </div>
        </fieldset>

        <div ref={boxRef} className="space-y-2 relative">
          <label className="text-sm font-medium" style={{ color: WAIZ.ink }}>
            Lead
          </label>
          {picked && !cantFind ? (
            <div
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-3"
              style={{ background: WAIZ.tint, border: `1px solid ${WAIZ.line}` }}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{picked.lead_name}</p>
                <p className="text-xs" style={{ color: WAIZ.muted }}>{picked.lead_phone || "No phone"}</p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold"
                style={{ color: WAIZ.accent700 }}
                onClick={() => {
                  setPicked(null);
                  setQuery("");
                }}
              >
                Change
              </button>
            </div>
          ) : cantFind ? (
            <div className="space-y-2">
              <input
                style={INPUT}
                placeholder="Lead name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
              />
              <input
                style={INPUT}
                placeholder="Phone"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                required
              />
              <button
                type="button"
                className="text-xs font-semibold"
                style={{ color: WAIZ.accent700 }}
                onClick={() => {
                  setCantFind(false);
                  setNewName("");
                  setNewPhone("");
                }}
              >
                Search existing leads
              </button>
            </div>
          ) : (
            <>
              <input
                style={INPUT}
                placeholder="Search by name"
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setOpenList(true);
                }}
                onFocus={() => hits.length > 0 && setOpenList(true)}
                autoComplete="off"
              />
              {openList && hits.length > 0 && (
                <ul
                  className="absolute z-10 left-0 right-0 mt-1 rounded-xl overflow-hidden max-h-56 overflow-y-auto"
                  style={{ background: WAIZ.white, border: `1px solid ${WAIZ.line}`, boxShadow: "0 8px 24px rgba(6,26,74,.12)" }}
                >
                  {hits.map(hit => (
                    <li key={`${hit.ghl_contact_id}-${hit.lead_phone}`}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50"
                        onClick={() => {
                          setPicked(hit);
                          setOpenList(false);
                          setQuery("");
                        }}
                      >
                        <span className="block text-sm font-medium">{hit.lead_name}</span>
                        <span className="block text-xs" style={{ color: WAIZ.muted }}>{hit.lead_phone || "No phone"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="text-xs font-semibold"
                style={{ color: WAIZ.accent700 }}
                onClick={() => {
                  setCantFind(true);
                  setPicked(null);
                  setOpenList(false);
                }}
              >
                Can’t find this lead
              </button>
            </>
          )}
        </div>

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

        <label className="block space-y-2">
          <span className="text-sm font-medium" style={{ color: WAIZ.ink }}>Loan size</span>
          <input
            style={INPUT}
            inputMode="decimal"
            placeholder="250000"
            value={loanSize}
            onChange={e => setLoanSize(e.target.value)}
            required
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

"use client";

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  BTN_PRIMARY_BG,
  FONT_BODY,
  FONT_DISPLAY,
  SHADOW,
  WAIZ,
  WaizWordmark,
} from "@/components/onboarding/brand";
import {
  CONTACT_TYPE_OPTIONS,
  contactRequiresLicensedStates,
  type ContactType,
} from "@/lib/client-contacts";
import { US_STATES } from "@/lib/us-states";

type Prefetch = {
  client_name: string;
  primary_contact_name: string | null;
};

type Draft = {
  contact_type: ContactType | "";
  name: string;
  email: string;
  phone: string;
  nmls: string;
  states_licensed: string[];
  notes: string;
};

const EMPTY: Draft = {
  contact_type: "",
  name: "",
  email: "",
  phone: "",
  nmls: "",
  states_licensed: [],
  notes: "",
};

const INPUT =
  "w-full px-4 py-3 text-sm outline-none rounded-xl border bg-white";

export default function TeamInviteForm({ token }: { token: string }) {
  const [prefetch, setPrefetch] = useState<Prefetch | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/onboard/team?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Invalid invite link");
        if (!cancelled) setPrefetch(data);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Invalid invite link");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const showNmls = draft.contact_type === "loa" || draft.contact_type === "co_lo";
  const showStates = contactRequiresLicensedStates(draft.contact_type);

  function canSubmit(): boolean {
    if (!draft.contact_type || !draft.name.trim()) return false;
    if (showStates && draft.states_licensed.length === 0) return false;
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/onboard/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          contact_type: draft.contact_type,
          name: draft.name.trim(),
          email: draft.email.trim() || null,
          phone: draft.phone.trim() || null,
          nmls: draft.nmls.trim() || null,
          states_licensed: showStates ? draft.states_licensed : null,
          notes: draft.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <Card>
          <h1 style={titleStyle}>Link not valid</h1>
          <p style={bodyStyle}>{loadError}</p>
          <p style={{ ...bodyStyle, marginTop: "1rem", color: WAIZ.muted }}>
            Ask your Waiz contact for a fresh team invite link.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!prefetch) {
    return (
      <Shell>
        <p style={{ ...bodyStyle, textAlign: "center", color: WAIZ.muted }}>Loading…</p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Card>
          <p
            style={{
              fontFamily: FONT_BODY,
              fontSize: ".78rem",
              fontWeight: 500,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: WAIZ.accent700,
              marginBottom: "0.75rem",
            }}
          >
            You&apos;re on the file
          </p>
          <h1 style={titleStyle}>Thanks — you&apos;re added</h1>
          <p style={bodyStyle}>
            Your info is on the <strong>{prefetch.client_name}</strong> account
            {prefetch.primary_contact_name ? ` with ${prefetch.primary_contact_name}` : ""}.
            Your Waiz team can see it in the Client File.
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <p
          style={{
            fontFamily: FONT_BODY,
            fontSize: ".78rem",
            fontWeight: 500,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: WAIZ.accent700,
            marginBottom: "0.5rem",
          }}
        >
          Team member form
        </p>
        <h1 style={titleStyle}>Join {prefetch.client_name}</h1>
        <p style={{ ...bodyStyle, marginBottom: "1.5rem" }}>
          {prefetch.primary_contact_name
            ? `Fill this out so we can add you to ${prefetch.primary_contact_name}'s account.`
            : "Fill this out so we can add you to this Waiz client account."}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span style={labelStyle}>Your role</span>
            <select
              required
              value={draft.contact_type}
              onChange={e =>
                setDraft(d => ({
                  ...d,
                  contact_type: e.target.value as ContactType | "",
                  states_licensed:
                    e.target.value === "co_lo" ? d.states_licensed : [],
                }))
              }
              className={INPUT}
              style={inputStyle}
            >
              <option value="" disabled>
                Select…
              </option>
              {CONTACT_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span style={labelStyle}>Full name</span>
            <input
              required
              type="text"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              className={INPUT}
              style={inputStyle}
              placeholder="Jane Smith"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span style={labelStyle}>Email</span>
              <input
                type="email"
                value={draft.email}
                onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                className={INPUT}
                style={inputStyle}
              />
            </label>
            <label className="block">
              <span style={labelStyle}>Phone</span>
              <input
                type="tel"
                value={draft.phone}
                onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                className={INPUT}
                style={inputStyle}
              />
            </label>
          </div>

          {showNmls && (
            <label className="block">
              <span style={labelStyle}>NMLS (optional)</span>
              <input
                type="text"
                value={draft.nmls}
                onChange={e => setDraft(d => ({ ...d, nmls: e.target.value }))}
                className={INPUT}
                style={inputStyle}
              />
            </label>
          )}

          {showStates && (
            <fieldset>
              <legend style={{ ...labelStyle, marginBottom: "0.5rem" }}>
                Licensed states <span style={{ color: "#b45309" }}>*</span>
              </legend>
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-3 rounded-xl"
                style={{ border: `1px solid ${WAIZ.line}`, background: WAIZ.tint }}
              >
                {US_STATES.map(s => {
                  const checked = draft.states_licensed.includes(s.code);
                  return (
                    <label
                      key={s.code}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                      style={{ fontFamily: FONT_BODY, color: WAIZ.ink }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDraft(d => ({
                            ...d,
                            states_licensed: checked
                              ? d.states_licensed.filter(c => c !== s.code)
                              : [...d.states_licensed, s.code],
                          }))
                        }
                      />
                      {s.code}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <label className="block">
            <span style={labelStyle}>Anything we should know? (optional)</span>
            <textarea
              value={draft.notes}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              rows={2}
              className={`${INPUT} resize-y`}
              style={inputStyle}
              placeholder="Role on the team, best times to loop you in…"
            />
          </label>

          {submitError && (
            <p style={{ fontFamily: FONT_BODY, fontSize: ".875rem", color: "#dc2626" }}>
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !canSubmit()}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm"
            style={{
              fontFamily: FONT_BODY,
              background: BTN_PRIMARY_BG,
              opacity: submitting || !canSubmit() ? 0.55 : 1,
              boxShadow: SHADOW,
            }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: WAIZ.soft }}>
      <header className="px-6 sm:px-8 py-5">
        <span style={{ color: WAIZ.navy }}>
          <WaizWordmark height={24} />
        </span>
      </header>
      <div className="flex-1 flex items-start justify-center px-4 pb-16 pt-4">{children}</div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full max-w-lg p-6 sm:p-8"
      style={{
        borderRadius: 22,
        background: WAIZ.white,
        border: `1px solid ${WAIZ.line}`,
        boxShadow: SHADOW,
      }}
    >
      {children}
    </div>
  );
}

const titleStyle: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  fontSize: "1.5rem",
  color: WAIZ.ink,
  marginBottom: "0.5rem",
  lineHeight: 1.25,
};

const bodyStyle: CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: ".95rem",
  color: WAIZ.muted,
  lineHeight: 1.55,
};

const labelStyle: CSSProperties = {
  display: "block",
  fontFamily: FONT_BODY,
  fontSize: ".72rem",
  fontWeight: 600,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: WAIZ.muted,
  marginBottom: "0.35rem",
};

const inputStyle: CSSProperties = {
  borderColor: WAIZ.line,
  color: WAIZ.ink,
  fontFamily: FONT_BODY,
};

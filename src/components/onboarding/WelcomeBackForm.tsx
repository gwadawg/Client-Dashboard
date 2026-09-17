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
import type { WelcomeBackPrefill } from "@/lib/welcome-back-onboarding";
import { US_STATES } from "@/lib/us-states";
import { US_CLIENT_TIMEZONES } from "@/lib/us-timezones";

/** Keep in sync with CONTACT_ROLE_OPTIONS in kickoff (avoid importing that module on the client). */
const CONTACT_ROLE_OPTIONS = [
  "Loan Officer",
  "Branch Manager",
  "Broker Owner",
  "MLO",
  "Team Lead",
  "Other",
] as const;

type Draft = {
  primary_contact_name: string;
  email: string;
  phone: string;
  brokerage_name: string;
  legal_business_name: string;
  nmls: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  states_licensed: string[];
  timezone: string;
  website: string;
  facebook_page_name: string;
  contact_role: string;
  biography: string;
};

const INPUT = "w-full px-4 py-3 text-sm outline-none rounded-xl border bg-white";

function prefillToDraft(p: WelcomeBackPrefill): Draft {
  return {
    primary_contact_name: p.primary_contact_name ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    brokerage_name: p.brokerage_name ?? "",
    legal_business_name: p.legal_business_name ?? "",
    nmls: p.nmls ?? "",
    street_address: p.street_address ?? "",
    city: p.city ?? "",
    state: (p.state ?? "").toUpperCase().slice(0, 2),
    zip_code: p.zip_code ?? "",
    states_licensed: [...(p.states_licensed ?? [])],
    timezone: p.timezone ?? "",
    website: p.website ?? "",
    facebook_page_name: p.facebook_page_name ?? "",
    contact_role: p.contact_role ?? "",
    biography: p.biography ?? "",
  };
}

export default function WelcomeBackForm({ token }: { token: string }) {
  const [clientName, setClientName] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/onboard/welcome-back/${encodeURIComponent(token)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Invalid welcome-back link",
          );
        }
        if (cancelled) return;
        const already = data.already_submitted === true;
        const { already_submitted: _a, error: _e, ...prefillFields } = data as Record<
          string,
          unknown
        > & { already_submitted?: boolean };
        const client = prefillFields as unknown as WelcomeBackPrefill;
        setClientName(client?.name ?? null);
        if (already) {
          setAlreadySubmitted(true);
          return;
        }
        setDraft(prefillToDraft(client));
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Invalid welcome-back link");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function patch(partial: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...partial } : d));
  }

  function toggleState(code: string) {
    setDraft((d) => {
      if (!d) return d;
      const on = d.states_licensed.includes(code);
      return {
        ...d,
        states_licensed: on
          ? d.states_licensed.filter((c) => c !== code)
          : [...d.states_licensed, code].sort(),
      };
    });
  }

  function canSubmit(): boolean {
    if (!draft) return false;
    if (!draft.primary_contact_name.trim()) return false;
    if (!draft.email.trim() || !draft.phone.trim()) return false;
    if (!draft.nmls.trim()) return false;
    if (!draft.city.trim() || !draft.state.trim()) return false;
    if (!draft.timezone) return false;
    if (draft.states_licensed.length === 0) return false;
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !canSubmit() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `/api/onboard/welcome-back/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.error === "already_submitted") {
        setAlreadySubmitted(true);
        return;
      }
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to submit");
      }
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
          <p style={eyebrowStyle}>Welcome back</p>
          <h1 style={titleStyle}>This link isn&apos;t valid</h1>
          <p style={bodyStyle}>
            We couldn&apos;t find a welcome-back form for this link. Ask your Waiz
            contact for a fresh one.
          </p>
        </Card>
      </Shell>
    );
  }

  if (alreadySubmitted) {
    return (
      <Shell>
        <Card>
          <p style={eyebrowStyle}>Welcome back</p>
          <h1 style={titleStyle}>Already submitted</h1>
          <p style={bodyStyle}>
            We already have your welcome-back details
            {clientName ? (
              <>
                {" "}
                for <strong>{clientName}</strong>
              </>
            ) : null}
            . Your Waiz team will follow up if anything else is needed.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!draft) {
    return (
      <Shell>
        <p style={{ ...bodyStyle, textAlign: "center", color: WAIZ.muted }}>
          Loading…
        </p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Card>
          <p style={eyebrowStyle}>Welcome back</p>
          <h1 style={titleStyle}>Thanks — you&apos;re confirmed</h1>
          <p style={bodyStyle}>
            We saved your updated info
            {clientName ? (
              <>
                {" "}
                for <strong>{clientName}</strong>
              </>
            ) : null}
            . Your Waiz team will be in touch about next steps.
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card wide>
        <p style={eyebrowStyle}>Welcome back</p>
        <h1 style={titleStyle}>Welcome back — confirm or update your info</h1>
        <p style={{ ...bodyStyle, marginBottom: "1.5rem" }}>
          {clientName
            ? `We prefilled what we have on file for ${clientName}. Update anything that changed, then submit.`
            : "We prefilled what we have on file. Update anything that changed, then submit."}
        </p>

        <form onSubmit={onSubmit} className="space-y-6">
          <Section title="Contact">
            <label className="block">
              <span style={labelStyle}>Primary contact name</span>
              <input
                required
                type="text"
                value={draft.primary_contact_name}
                onChange={(e) => patch({ primary_contact_name: e.target.value })}
                className={INPUT}
                style={inputStyle}
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span style={labelStyle}>Email</span>
                <input
                  required
                  type="email"
                  value={draft.email}
                  onChange={(e) => patch({ email: e.target.value })}
                  className={INPUT}
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span style={labelStyle}>Phone</span>
                <input
                  required
                  type="tel"
                  value={draft.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                  className={INPUT}
                  style={inputStyle}
                />
              </label>
            </div>
            <label className="block">
              <span style={labelStyle}>Role</span>
              <select
                value={draft.contact_role}
                onChange={(e) => patch({ contact_role: e.target.value })}
                className={INPUT}
                style={inputStyle}
              >
                <option value="">Select…</option>
                {CONTACT_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
                {draft.contact_role &&
                !(CONTACT_ROLE_OPTIONS as readonly string[]).includes(draft.contact_role) ? (
                  <option value={draft.contact_role}>{draft.contact_role}</option>
                ) : null}
              </select>
            </label>
          </Section>

          <Section title="Business">
            <label className="block">
              <span style={labelStyle}>Brokerage / lender</span>
              <input
                type="text"
                value={draft.brokerage_name}
                onChange={(e) => patch({ brokerage_name: e.target.value })}
                className={INPUT}
                style={inputStyle}
              />
            </label>
            <label className="block">
              <span style={labelStyle}>Legal business name</span>
              <input
                type="text"
                value={draft.legal_business_name}
                onChange={(e) => patch({ legal_business_name: e.target.value })}
                className={INPUT}
                style={inputStyle}
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span style={labelStyle}>NMLS #</span>
                <input
                  required
                  type="text"
                  value={draft.nmls}
                  onChange={(e) => patch({ nmls: e.target.value })}
                  className={INPUT}
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span style={labelStyle}>Website</span>
                <input
                  type="text"
                  value={draft.website}
                  onChange={(e) => patch({ website: e.target.value })}
                  className={INPUT}
                  style={inputStyle}
                  placeholder="https://"
                />
              </label>
            </div>
            <label className="block">
              <span style={labelStyle}>Facebook page name</span>
              <input
                type="text"
                value={draft.facebook_page_name}
                onChange={(e) => patch({ facebook_page_name: e.target.value })}
                className={INPUT}
                style={inputStyle}
              />
            </label>
          </Section>

          <Section title="Location & licensing">
            <label className="block">
              <span style={labelStyle}>Street address</span>
              <input
                type="text"
                value={draft.street_address}
                onChange={(e) => patch({ street_address: e.target.value })}
                className={INPUT}
                style={inputStyle}
              />
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <label className="block">
                <span style={labelStyle}>City</span>
                <input
                  required
                  type="text"
                  value={draft.city}
                  onChange={(e) => patch({ city: e.target.value })}
                  className={INPUT}
                  style={inputStyle}
                />
              </label>
              <label className="block">
                <span style={labelStyle}>State</span>
                <select
                  required
                  value={draft.state}
                  onChange={(e) => patch({ state: e.target.value })}
                  className={INPUT}
                  style={inputStyle}
                >
                  <option value="">Select…</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span style={labelStyle}>ZIP</span>
                <input
                  type="text"
                  value={draft.zip_code}
                  onChange={(e) => patch({ zip_code: e.target.value })}
                  className={INPUT}
                  style={inputStyle}
                />
              </label>
            </div>
            <label className="block">
              <span style={labelStyle}>Timezone</span>
              <select
                required
                value={draft.timezone}
                onChange={(e) => patch({ timezone: e.target.value })}
                className={INPUT}
                style={inputStyle}
              >
                <option value="">Select…</option>
                {US_CLIENT_TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                {draft.timezone &&
                !US_CLIENT_TIMEZONES.some((t) => t.value === draft.timezone) ? (
                  <option value={draft.timezone}>{draft.timezone}</option>
                ) : null}
              </select>
            </label>
            <fieldset>
              <legend style={{ ...labelStyle, marginBottom: "0.5rem" }}>
                States licensed <span style={{ color: "#b45309" }}>*</span>
              </legend>
              <div
                className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-52 overflow-y-auto p-3 rounded-xl"
                style={{ border: `1px solid ${WAIZ.line}`, background: WAIZ.tint }}
              >
                {US_STATES.map((s) => {
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
                        onChange={() => toggleState(s.code)}
                      />
                      {s.code}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Section>

          <Section title="About you">
            <label className="block">
              <span style={labelStyle}>Short bio (optional)</span>
              <textarea
                value={draft.biography}
                onChange={(e) => patch({ biography: e.target.value })}
                rows={4}
                className={`${INPUT} resize-y`}
                style={inputStyle}
              />
            </label>
          </Section>

          {submitError && (
            <p
              style={{
                fontFamily: FONT_BODY,
                fontSize: ".875rem",
                color: "#dc2626",
              }}
            >
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
            {submitting ? "Saving…" : "Confirm & submit"}
          </button>
        </form>
      </Card>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: "1.05rem",
          color: WAIZ.ink,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
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
      <div className="flex-1 flex items-start justify-center px-4 pb-16 pt-4">
        {children}
      </div>
    </div>
  );
}

function Card({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} p-6 sm:p-8`}
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

const eyebrowStyle: CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: ".78rem",
  fontWeight: 500,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: WAIZ.accent700,
  marginBottom: "0.5rem",
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

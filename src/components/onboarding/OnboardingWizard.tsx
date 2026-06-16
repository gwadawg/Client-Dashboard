"use client";

import { useCallback, useMemo, useState } from "react";
import OnboardingChoiceCard from "@/components/onboarding/OnboardingChoiceCard";
import OnboardingThankYou from "@/components/onboarding/OnboardingThankYou";
import { CONTACT_TYPE_OPTIONS } from "@/lib/client-contacts";
import { draftToSubmitBody } from "@/lib/onboarding-form";
import {
  ACCOUNT_MANAGEMENT_OPTIONS,
  EMPTY_MEMBER_DRAFT,
  EMPTY_ONBOARDING_DRAFT,
  OB_ROLE_OPTIONS,
  emphasizesAddMembers,
  getActiveStepSequence,
  getMemberStepSequence,
  stepQuestion,
  validateStep,
  type MainStepId,
  type MemberDraft,
  type MemberStepId,
  type OnboardingDraft,
  type StepId,
} from "@/lib/onboarding-steps";
import { US_STATES } from "@/lib/us-states";
import { US_CLIENT_TIMEZONES } from "@/lib/us-timezones";

const INPUT =
  "w-full px-4 py-3 rounded-xl text-sm border border-gray-300 focus:border-gray-900 outline-none text-gray-900 bg-white";

export default function OnboardingWizard() {
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_ONBOARDING_DRAFT);
  const [memberDraft, setMemberDraft] = useState<MemberDraft>(EMPTY_MEMBER_DRAFT);
  const [step, setStep] = useState<StepId>("welcome");
  const [inMemberFlow, setInMemberFlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [thankYou, setThankYou] = useState<{ message: string; matched: boolean } | null>(null);

  const ctx = useMemo(
    () => ({ draft, memberDraft, inMemberFlow }),
    [draft, memberDraft, inMemberFlow],
  );

  const sequence = useMemo(() => getActiveStepSequence(ctx), [ctx]);
  const stepIndex = sequence.indexOf(step);
  const progress = sequence.length > 0 ? ((stepIndex + 1) / sequence.length) * 100 : 0;

  const patchDraft = useCallback((patch: Partial<OnboardingDraft>) => {
    setDraft(d => ({ ...d, ...patch }));
  }, []);

  const patchMember = useCallback((patch: Partial<MemberDraft>) => {
    setMemberDraft(m => ({ ...m, ...patch }));
  }, []);

  const goToStep = useCallback((next: StepId) => {
    setError(null);
    setStep(next);
  }, []);

  const goNext = useCallback(() => {
    const err = validateStep(step, ctx);
    if (err) {
      setError(err);
      return;
    }
    setError(null);

    if (inMemberFlow) {
      const memberSteps = getMemberStepSequence(memberDraft);
      const idx = memberSteps.indexOf(step as MemberStepId);
      if (idx < memberSteps.length - 1) {
        goToStep(memberSteps[idx + 1]);
        return;
      }
      setDraft(d => ({
        ...d,
        additional_members: [...d.additional_members, { ...memberDraft }],
      }));
      setMemberDraft(EMPTY_MEMBER_DRAFT);
      setInMemberFlow(false);
      goToStep("add_members");
      return;
    }

    const mainSteps = sequence as StepId[];
    const idx = mainSteps.indexOf(step);
    if (idx < mainSteps.length - 1) {
      goToStep(mainSteps[idx + 1]);
    }
  }, [ctx, goToStep, inMemberFlow, memberDraft, sequence, step]);

  const goBack = useCallback(() => {
    setError(null);
    if (inMemberFlow) {
      const memberSteps = getMemberStepSequence(memberDraft);
      const idx = memberSteps.indexOf(step as MemberStepId);
      if (idx <= 0) {
        setInMemberFlow(false);
        setMemberDraft(EMPTY_MEMBER_DRAFT);
        goToStep("add_members");
        return;
      }
      goToStep(memberSteps[idx - 1]);
      return;
    }

    const idx = sequence.indexOf(step);
    if (idx > 0) goToStep(sequence[idx - 1]);
  }, [goToStep, inMemberFlow, memberDraft, sequence, step]);

  const selectAndAdvance = useCallback(
    (patch: Partial<OnboardingDraft>, next?: StepId) => {
      const nextDraft = { ...draft, ...patch };
      setDraft(nextDraft);
      setError(null);
      const err = validateStep(step, { draft: nextDraft, memberDraft, inMemberFlow });
      if (err) {
        setError(err);
        return;
      }
      if (next) {
        goToStep(next);
        return;
      }
      const mainSteps = getActiveStepSequence({ draft: nextDraft, memberDraft, inMemberFlow });
      const idx = mainSteps.indexOf(step);
      if (idx < mainSteps.length - 1) goToStep(mainSteps[idx + 1]);
    },
    [draft, goToStep, inMemberFlow, memberDraft, step],
  );

  const selectMemberAndAdvance = useCallback(
    (patch: Partial<MemberDraft>) => {
      const nextMember = { ...memberDraft, ...patch };
      setMemberDraft(nextMember);
      setError(null);
      const memberSteps = getMemberStepSequence(nextMember);
      const idx = memberSteps.indexOf(step as MemberStepId);
      if (idx < memberSteps.length - 1) {
        goToStep(memberSteps[idx + 1]);
      }
    },
    [goToStep, memberDraft, step],
  );

  async function handleSubmit() {
    const mainSteps = getActiveStepSequence({ draft, memberDraft: EMPTY_MEMBER_DRAFT, inMemberFlow: false });
    for (const s of mainSteps) {
      if (s === "add_members") continue;
      const err = validateStep(s, { draft, memberDraft: EMPTY_MEMBER_DRAFT, inMemberFlow: false });
      if (err) {
        setError(err);
        goToStep(s);
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    const body = draftToSubmitBody(draft);
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      form.set(key, value);
    }
    if (draft.headshot) form.set("headshot", draft.headshot);

    const res = await fetch("/api/onboard/submit", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    setThankYou({
      message: data.message ?? "Thank you — we received your information.",
      matched: !!data.matched,
    });
  }

  if (thankYou) {
    return <OnboardingThankYou message={thankYou.message} matched={thankYou.matched} />;
  }

  const showBack = step !== "welcome";
  const question = stepQuestion(step);
  const emphasizeMembers = emphasizesAddMembers(draft.account_management);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f8fafc" }}>
      <header className="px-6 py-5 flex items-center justify-between">
        <Logo />
        {step !== "welcome" && (
          <span className="text-xs text-gray-500 font-medium">
            {stepIndex + 1} / {sequence.length}
          </span>
        )}
      </header>

      {step !== "welcome" && (
        <div className="px-6 mb-6">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "#e2e8f0" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, background: "#0f172a" }}
            />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center px-4 pb-12">
        <div className="w-full max-w-2xl">
          {step === "welcome" && (
            <div className="text-center pt-8 sm:pt-16">
              <span
                className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold mb-6"
                style={{ background: "#fef08a", color: "#713f12" }}
              >
                Glad You&apos;re Here — Let&apos;s Get You Onboarded
              </span>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 tracking-tight">
                The 6-Minute Fast-Track Onboarding™
              </h1>
              <p className="text-gray-600 text-sm sm:text-base mb-10 max-w-md mx-auto">
                A few quick questions so we can set up your account, landing page, and campaigns.
              </p>
              <ContinueButton onClick={() => goToStep("management")} label="Get started" />
            </div>
          )}

          {step !== "welcome" && question && (
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-8 px-2">
              {question}
            </h2>
          )}

          {step === "management" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ACCOUNT_MANAGEMENT_OPTIONS.map(opt => (
                <OnboardingChoiceCard
                  key={opt.value}
                  label={opt.label}
                  icon={managementIcon(opt.icon)}
                  selected={draft.account_management === opt.value}
                  onClick={() => selectAndAdvance({ account_management: opt.value })}
                />
              ))}
            </div>
          )}

          {step === "role" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
              {OB_ROLE_OPTIONS.map(opt => (
                <OnboardingChoiceCard
                  key={opt.value}
                  label={opt.label}
                  icon={roleIcon(opt.icon)}
                  selected={draft.ob_role === opt.value}
                  onClick={() => selectAndAdvance({ ob_role: opt.value })}
                />
              ))}
            </div>
          )}

          {step === "mlo_company_name" && (
            <FieldStep
              value={draft.brokerage_name}
              onChange={v => patchDraft({ brokerage_name: v })}
              placeholder="Company name"
              onContinue={goNext}
            />
          )}

          {step === "owner_company_name" && (
            <FieldStep
              value={draft.company_name}
              onChange={v => patchDraft({ company_name: v })}
              placeholder="Company name"
              onContinue={goNext}
            />
          )}

          {step === "owner_website" && (
            <FieldStep
              value={draft.website}
              onChange={v => patchDraft({ website: v })}
              placeholder="https://yourcompany.com"
              type="url"
              onContinue={goNext}
            />
          )}

          {step === "owner_company_nmls" && (
            <FieldStep
              value={draft.company_nmls}
              onChange={v => patchDraft({ company_nmls: v })}
              placeholder="Company NMLS #"
              onContinue={goNext}
            />
          )}

          {step === "owner_company_address" && (
            <div className="space-y-3 max-w-md mx-auto">
              <input
                className={INPUT}
                placeholder="Street address"
                value={draft.company_address.street}
                onChange={e =>
                  patchDraft({
                    company_address: { ...draft.company_address, street: e.target.value },
                  })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={INPUT}
                  placeholder="City"
                  value={draft.company_address.city}
                  onChange={e =>
                    patchDraft({
                      company_address: { ...draft.company_address, city: e.target.value },
                    })
                  }
                />
                <select
                  className={INPUT}
                  value={draft.company_address.state}
                  onChange={e =>
                    patchDraft({
                      company_address: { ...draft.company_address, state: e.target.value },
                    })
                  }
                >
                  <option value="">State</option>
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.code}</option>
                  ))}
                </select>
              </div>
              <input
                className={INPUT}
                placeholder="ZIP code"
                value={draft.company_address.zip}
                onChange={e =>
                  patchDraft({
                    company_address: { ...draft.company_address, zip: e.target.value },
                  })
                }
              />
              <ContinueButton onClick={goNext} />
            </div>
          )}

          {step === "owner_company_states" && (
            <StatesGrid
              value={draft.company_states_licensed}
              onChange={codes => patchDraft({ company_states_licensed: codes })}
              onContinue={goNext}
            />
          )}

          {step === "person_nmls" && (
            <FieldStep
              value={draft.nmls}
              onChange={v => patchDraft({ nmls: v })}
              placeholder="Your NMLS #"
              onContinue={goNext}
            />
          )}

          {step === "person_phone" && (
            <FieldStep
              value={draft.phone}
              onChange={v => patchDraft({ phone: v })}
              placeholder="(555) 123-4567"
              type="tel"
              onContinue={goNext}
            />
          )}

          {step === "person_email" && (
            <FieldStep
              value={draft.email}
              onChange={v => patchDraft({ email: v })}
              placeholder="you@company.com"
              type="email"
              onContinue={goNext}
            />
          )}

          {step === "person_states" && (
            <StatesGrid
              value={draft.states_licensed}
              onChange={codes => patchDraft({ states_licensed: codes })}
              onContinue={goNext}
            />
          )}

          {step === "person_location" && (
            <div className="space-y-3 max-w-md mx-auto">
              <input
                className={INPUT}
                placeholder="Street address (optional)"
                value={draft.street_address}
                onChange={e => patchDraft({ street_address: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={INPUT}
                  placeholder="City"
                  value={draft.city}
                  onChange={e => patchDraft({ city: e.target.value })}
                />
                <select
                  className={INPUT}
                  value={draft.state}
                  onChange={e => patchDraft({ state: e.target.value })}
                >
                  <option value="">State</option>
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.code}</option>
                  ))}
                </select>
              </div>
              <input
                className={INPUT}
                placeholder="ZIP code (optional)"
                value={draft.zip_code}
                onChange={e => patchDraft({ zip_code: e.target.value })}
              />
              <ContinueButton onClick={goNext} />
            </div>
          )}

          {step === "person_timezone" && (
            <div className="max-w-md mx-auto space-y-4">
              <select
                className={INPUT}
                value={draft.timezone}
                onChange={e => patchDraft({ timezone: e.target.value })}
              >
                <option value="">Select your timezone</option>
                {US_CLIENT_TIMEZONES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ContinueButton onClick={goNext} />
            </div>
          )}

          {step === "review_url" && (
            <div className="max-w-md mx-auto space-y-3">
              <FieldStep
                value={draft.review_url}
                onChange={v => patchDraft({ review_url: v })}
                placeholder="https://… (optional — skip if none)"
                type="url"
                onContinue={goNext}
                hideButton
              />
              <ContinueButton onClick={goNext} label="Continue" />
              <button
                type="button"
                onClick={() => {
                  patchDraft({ review_url: "" });
                  goNext();
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                Skip — I don&apos;t have reviews yet
              </button>
            </div>
          )}

          {step === "bio" && (
            <div className="max-w-md mx-auto space-y-4">
              <textarea
                className={`${INPUT} min-h-[140px] resize-y`}
                placeholder="Short biography (doesn't need to be perfect — we'll refine later)"
                value={draft.biography}
                onChange={e => patchDraft({ biography: e.target.value })}
              />
              <ContinueButton onClick={goNext} />
            </div>
          )}

          {step === "headshot" && (
            <div className="max-w-md mx-auto space-y-4">
              <label
                className="flex flex-col items-center justify-center gap-3 p-8 rounded-2xl cursor-pointer border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors"
                style={{ background: "#fafafa" }}
              >
                <span className="text-3xl text-gray-400">📁</span>
                <span className="text-sm font-medium text-gray-700 text-center">
                  {draft.headshot ? draft.headshot.name : "Headshot / Professional Photo"}
                </span>
                <span className="text-xs text-gray-500">max 25MB — JPG, PNG, WEBP, or GIF</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={e => patchDraft({ headshot: e.target.files?.[0] ?? null })}
                />
              </label>
              <ContinueButton onClick={goNext} label={draft.headshot ? "Continue" : "Skip for now"} />
            </div>
          )}

          {step === "add_members" && !inMemberFlow && (
            <div className="max-w-md mx-auto space-y-4">
              {draft.additional_members.length > 0 && (
                <ul className="rounded-xl p-4 space-y-2 mb-4" style={{ background: "#f1f5f9" }}>
                  {draft.additional_members.map((m, i) => (
                    <li key={i} className="text-sm text-gray-700 flex justify-between gap-2">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-gray-500">
                        {CONTACT_TYPE_OPTIONS.find(o => o.value === m.contact_type)?.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <OnboardingChoiceCard
                label={emphasizeMembers ? "Yes — add a team member" : "Add someone else (optional)"}
                icon={<span className="text-3xl">+</span>}
                onClick={() => {
                  setInMemberFlow(true);
                  setMemberDraft(EMPTY_MEMBER_DRAFT);
                  goToStep("member_type");
                }}
              />
              <ContinueButton
                onClick={handleSubmit}
                label={submitting ? "Submitting…" : "I'm done — submit"}
                disabled={submitting}
              />
            </div>
          )}

          {inMemberFlow && step === "member_type" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto">
              {CONTACT_TYPE_OPTIONS.map(opt => (
                <OnboardingChoiceCard
                  key={opt.value}
                  label={opt.label}
                  icon={<span className="text-2xl">👤</span>}
                  selected={memberDraft.contact_type === opt.value}
                  onClick={() => {
                    patchMember({ contact_type: opt.value });
                    selectMemberAndAdvance({ contact_type: opt.value });
                  }}
                />
              ))}
            </div>
          )}

          {inMemberFlow && step === "member_name" && (
            <FieldStep
              value={memberDraft.name}
              onChange={v => patchMember({ name: v })}
              placeholder="Full name"
              onContinue={goNext}
            />
          )}

          {inMemberFlow && step === "member_email" && (
            <FieldStep
              value={memberDraft.email}
              onChange={v => patchMember({ email: v })}
              placeholder="Email"
              type="email"
              onContinue={goNext}
            />
          )}

          {inMemberFlow && step === "member_phone" && (
            <FieldStep
              value={memberDraft.phone}
              onChange={v => patchMember({ phone: v })}
              placeholder="Phone"
              type="tel"
              onContinue={goNext}
            />
          )}

          {inMemberFlow && step === "member_nmls" && (
            <div className="max-w-md mx-auto space-y-3">
              <FieldStep
                value={memberDraft.nmls}
                onChange={v => patchMember({ nmls: v })}
                placeholder="NMLS # (optional)"
                onContinue={goNext}
                hideButton
              />
              <ContinueButton onClick={goNext} label="Continue" />
              <button
                type="button"
                onClick={() => {
                  patchMember({ nmls: "" });
                  goNext();
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                Skip
              </button>
            </div>
          )}

          {inMemberFlow && step === "member_states" && (
            <StatesGrid
              value={memberDraft.states_licensed}
              onChange={codes => patchMember({ states_licensed: codes })}
              onContinue={goNext}
            />
          )}

          {error && (
            <p className="mt-6 text-sm text-center text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-w-md mx-auto">
              {error}
            </p>
          )}

          {showBack && (
            <button
              type="button"
              onClick={goBack}
              className="mt-8 mx-auto block text-sm text-gray-500 hover:text-gray-800"
            >
              ← Back
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function FieldStep({
  value,
  onChange,
  placeholder,
  type = "text",
  onContinue,
  hideButton,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  onContinue: () => void;
  hideButton?: boolean;
}) {
  return (
    <div className="max-w-md mx-auto space-y-4">
      <input
        className={INPUT}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            onContinue();
          }
        }}
        autoFocus
      />
      {!hideButton && <ContinueButton onClick={onContinue} />}
    </div>
  );
}

function StatesGrid({
  value,
  onChange,
  onContinue,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  onContinue: () => void;
}) {
  const selected = new Set(value);

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange([...next].sort());
  }

  return (
    <div className="max-w-md mx-auto">
      <div
        className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto p-3 rounded-xl mb-4"
        style={{ background: "#f1f5f9" }}
      >
        {US_STATES.map(({ code }) => (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            className="py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: selected.has(code) ? "#0f172a" : "#fff",
              color: selected.has(code) ? "#fff" : "#475569",
              border: "1px solid #e2e8f0",
            }}
          >
            {code}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 text-center mb-4">
        {value.length ? `${value.length} selected` : "Select at least one state"}
      </p>
      <ContinueButton onClick={onContinue} />
    </div>
  );
}

function ContinueButton({
  onClick,
  label = "Continue",
  disabled,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full max-w-md mx-auto block py-3.5 rounded-xl text-sm font-semibold text-white transition-opacity"
      style={{ background: disabled ? "#94a3b8" : "#0f172a" }}
    >
      {label}
    </button>
  );
}

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M6 26V6l10 12L26 6v20h-4V14l-8 9.5L6 14v12H6z" fill="#0f172a" />
    </svg>
  );
}

function managementIcon(kind: string) {
  const common = { width: 48, height: 48, viewBox: "0 0 48 48", fill: "currentColor" };
  if (kind === "solo") {
    return (
      <svg {...common}>
        <circle cx="24" cy="16" r="8" />
        <path d="M10 42c0-8 6-14 14-14s14 6 14 14" />
        <path d="M30 12l2 2 4-4" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
    );
  }
  if (kind === "team") {
    return (
      <svg {...common}>
        <circle cx="16" cy="18" r="6" />
        <circle cx="32" cy="18" r="6" />
        <circle cx="24" cy="14" r="6" opacity="0.6" />
        <path d="M6 40c0-6 4-10 10-10M42 40c0-6-4-10-10-10" />
      </svg>
    );
  }
  if (kind === "assistant") {
    return (
      <svg {...common}>
        <circle cx="20" cy="16" r="7" />
        <path d="M8 40c0-7 5-12 12-12" />
        <rect x="30" y="22" width="10" height="8" rx="2" opacity="0.7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="18" cy="18" r="7" />
      <circle cx="30" cy="18" r="7" />
      <path d="M10 40c0-6 4-10 8-10M38 40c0-6-4-10-8-10" />
    </svg>
  );
}

function roleIcon(kind: string) {
  const common = { width: 48, height: 48, viewBox: "0 0 48 48" };
  if (kind === "mlo") {
    return (
      <svg {...common} fill="currentColor">
        <rect x="14" y="8" width="20" height="28" rx="2" opacity="0.25" />
        <circle cx="24" cy="16" r="5" />
        <path d="M16 38c0-5 3-8 8-8s8 3 8 8" />
        <rect x="12" y="22" width="24" height="14" rx="1" opacity="0.4" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="currentColor">
      <circle cx="24" cy="16" r="6" />
      <path d="M14 38c0-6 4-10 10-10s10 4 10 10" />
      <path d="M18 8h12v4H18z" opacity="0.5" />
    </svg>
  );
}

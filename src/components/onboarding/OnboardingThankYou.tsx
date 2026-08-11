"use client";

import { FONT_BODY, FONT_DISPLAY, SHADOW_NAVY, WAIZ, WaizWordmark } from "@/components/onboarding/brand";
import type { OnboardingFormVariant } from "@/lib/onboarding-steps";

const DSCR_TIMELINE = [
  { when: "Day 0", title: "Form received", detail: "Your answers are on file with our team." },
  { when: "Day 0–1", title: "File matched & prepared", detail: "We align your account and pre-build notes." },
  { when: "Day 1–3", title: "Onboarding call", detail: "We book or hold your kickoff call." },
  { when: "Day 2–7", title: "Build", detail: "Funnel, CRM path, and ads get built for your DSCR offer." },
  { when: "~Launch", title: "Soft QA → live", detail: "We QA the stack, then you go live." },
] as const;

type Props = {
  message: string;
  matched: boolean;
  firstName?: string | null;
  variant?: OnboardingFormVariant;
};

export default function OnboardingThankYou({
  message,
  matched,
  firstName,
  variant = "core",
}: Props) {
  const isDscr = variant === "dscr_performance";
  const greeting = firstName?.trim()
    ? `Thank you, ${firstName.trim()}`
    : isDscr
      ? "Thank you"
      : "You're in. We're building your engine.";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: WAIZ.soft }}>
      <header className="px-6 sm:px-8 py-5">
        <span style={{ color: WAIZ.navy }}>
          <WaizWordmark height={24} />
        </span>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div
          className="relative max-w-lg w-full overflow-hidden"
          style={{
            borderRadius: 26,
            background: `linear-gradient(165deg, ${WAIZ.navy} 0%, #040f2a 55%, ${WAIZ.royal} 100%)`,
            boxShadow: SHADOW_NAVY,
            padding: isDscr ? "2.75rem 2rem 2.5rem" : "3rem 2.25rem",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 60% at 85% 0%, rgba(79,163,255,.18), transparent 55%)",
            }}
          />
          <div className="relative text-center">
            <div
              className="mx-auto mb-6 flex items-center justify-center"
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(124,255,122,.12)",
                border: "1px solid rgba(124,255,122,.4)",
                boxShadow: "0 0 30px -6px rgba(124,255,122,.45)",
                color: WAIZ.green,
              }}
            >
              <CheckIcon />
            </div>
            <p
              className="mb-3"
              style={{
                fontFamily: FONT_BODY,
                fontSize: ".78rem",
                fontWeight: 500,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "rgba(159,201,255,.95)",
              }}
            >
              {isDscr ? "DSCR performance · Onboarding received" : "Onboarding received"}
            </p>
            <h1
              className="mb-4"
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: "clamp(1.6rem, 1.3rem + 1.4vw, 2.1rem)",
                fontWeight: 600,
                color: "#fff",
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              {greeting}
              {firstName?.trim() ? "." : isDscr ? "." : null}
            </h1>
            <p
              style={{
                fontFamily: FONT_BODY,
                color: "rgba(255,255,255,.74)",
                fontSize: ".98rem",
                lineHeight: 1.6,
              }}
            >
              {message}
            </p>

            {isDscr && (
              <ol className="mt-8 text-left space-y-0">
                {DSCR_TIMELINE.map((item, i) => (
                  <li key={item.when} className="flex gap-3">
                    <div className="flex flex-col items-center pt-0.5" aria-hidden>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: i === 0 ? WAIZ.green : "rgba(79,163,255,.55)",
                          boxShadow: i === 0 ? "0 0 10px rgba(124,255,122,.5)" : "none",
                          flexShrink: 0,
                        }}
                      />
                      {i < DSCR_TIMELINE.length - 1 && (
                        <span
                          style={{
                            width: 1,
                            flex: 1,
                            minHeight: 28,
                            background: "rgba(159,201,255,.25)",
                            marginTop: 4,
                          }}
                        />
                      )}
                    </div>
                    <div className="pb-5 min-w-0">
                      <p
                        style={{
                          fontFamily: FONT_BODY,
                          fontSize: ".7rem",
                          fontWeight: 500,
                          letterSpacing: ".08em",
                          textTransform: "uppercase",
                          color: "rgba(159,201,255,.9)",
                          marginBottom: 2,
                        }}
                      >
                        {item.when}
                      </p>
                      <p
                        style={{
                          fontFamily: FONT_DISPLAY,
                          fontWeight: 600,
                          fontSize: ".95rem",
                          color: "#fff",
                          marginBottom: 2,
                        }}
                      >
                        {item.title}
                      </p>
                      <p
                        style={{
                          fontFamily: FONT_BODY,
                          fontSize: ".85rem",
                          color: "rgba(255,255,255,.55)",
                          lineHeight: 1.45,
                        }}
                      >
                        {item.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <p
              className={isDscr ? "mt-2" : "mt-5"}
              style={{ fontFamily: FONT_BODY, color: "rgba(255,255,255,.5)", fontSize: ".85rem" }}
            >
              {matched
                ? "Check your email for next steps on your onboarding call."
                : "Our team will match this to your account and follow up shortly."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

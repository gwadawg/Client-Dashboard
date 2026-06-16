"use client";

import { FONT_BODY, FONT_DISPLAY, SHADOW_NAVY, WAIZ, WaizWordmark } from "@/components/onboarding/brand";

type Props = {
  message: string;
  matched: boolean;
};

export default function OnboardingThankYou({ message, matched }: Props) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: WAIZ.soft }}>
      <header className="px-6 sm:px-8 py-5">
        <span style={{ color: WAIZ.navy }}>
          <WaizWordmark height={24} />
        </span>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div
          className="relative max-w-lg w-full overflow-hidden text-center"
          style={{
            borderRadius: 26,
            background: `linear-gradient(165deg, ${WAIZ.navy} 0%, #040f2a 55%, ${WAIZ.royal} 100%)`,
            boxShadow: SHADOW_NAVY,
            padding: "3rem 2.25rem",
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
          <div className="relative">
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
              Onboarding received
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
              You&apos;re in. We&apos;re building your engine.
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
            <p
              className="mt-5"
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

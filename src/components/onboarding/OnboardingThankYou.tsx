"use client";

type Props = {
  message: string;
  matched: boolean;
};

export default function OnboardingThankYou({ message, matched }: Props) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f8fafc" }}>
      <header className="px-6 py-5">
        <Logo />
      </header>
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div
          className="max-w-lg w-full rounded-2xl p-8 sm:p-10 text-center"
          style={{ background: "#fff", border: "1px solid #e2e8f0" }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl"
            style={{ background: "#ecfdf5", color: "#059669" }}
          >
            ✓
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">You&apos;re all set!</h1>
          <p className="text-base text-gray-600 mb-2">{message}</p>
          {!matched && (
            <p className="text-sm text-gray-500 mt-4">
              Our team will match your submission to your account and follow up shortly.
            </p>
          )}
          {matched && (
            <p className="text-sm text-gray-500 mt-4">
              We&apos;ll be in touch about your onboarding call. Check your email for next steps.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M6 26V6l10 12L26 6v20h-4V14l-8 9.5L6 14v12H6z"
        fill="#0f172a"
      />
    </svg>
  );
}

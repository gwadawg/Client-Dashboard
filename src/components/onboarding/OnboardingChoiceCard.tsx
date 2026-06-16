"use client";

import { FONT_DISPLAY, WAIZ } from "@/components/onboarding/brand";

type Props = {
  label: string;
  icon: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
};

export default function OnboardingChoiceCard({ label, icon, selected, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ob-card group flex flex-col items-center justify-center gap-4 p-6 sm:p-7 text-center min-h-[150px] w-full"
      data-selected={selected ? "true" : undefined}
      style={{
        borderRadius: 18,
        background: selected ? `linear-gradient(180deg, ${WAIZ.tint}, #ffffff)` : "#ffffff",
        border: `1.5px solid ${selected ? "rgba(79,163,255,.55)" : WAIZ.line}`,
        boxShadow: selected
          ? "0 22px 48px -26px rgba(46,123,224,.55)"
          : "0 1px 2px rgba(6,26,74,.05),0 6px 16px rgba(6,26,74,.06)",
        transition: "transform .2s, box-shadow .2s, border-color .2s",
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: selected
            ? `linear-gradient(150deg, rgba(79,163,255,.22), rgba(79,163,255,.06))`
            : WAIZ.soft,
          color: selected ? WAIZ.accent700 : WAIZ.royal,
        }}
      >
        {icon}
      </span>
      <span
        className="text-sm sm:text-[0.95rem] font-medium leading-snug"
        style={{ fontFamily: FONT_DISPLAY, color: WAIZ.ink, letterSpacing: "-0.01em" }}
      >
        {label}
      </span>
    </button>
  );
}

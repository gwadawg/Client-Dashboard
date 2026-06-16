"use client";

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
      className="flex flex-col items-center justify-center gap-4 p-6 sm:p-8 rounded-2xl text-center transition-all min-h-[140px]"
      style={{
        background: selected ? "#f1f5f9" : "#e8edf2",
        border: selected ? "2px solid #0f172a" : "2px solid transparent",
        boxShadow: selected ? "0 4px 12px rgba(15,23,42,0.08)" : "none",
      }}
    >
      <div className="text-gray-900" style={{ width: 48, height: 48 }}>
        {icon}
      </div>
      <span className="text-sm sm:text-base font-medium text-gray-900 leading-snug">{label}</span>
    </button>
  );
}

"use client";

type ModalCloseButtonProps = {
  onClose: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
};

export default function ModalCloseButton({
  onClose,
  disabled,
  className = "",
  label = "Close dialog",
}: ModalCloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClose}
      disabled={disabled}
      aria-label={label}
      className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 disabled:opacity-40 ${className}`}
      style={{ color: "#475569", background: "rgba(255,255,255,0.04)" }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

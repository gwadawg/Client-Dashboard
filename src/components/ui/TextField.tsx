"use client";

import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  id: string;
  label: string;
  helper?: string;
  error?: string;
};

export default function TextField({
  id,
  label,
  helper,
  error,
  ...props
}: Props) {
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-[var(--color-ws-tertiary)]">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "w-full min-h-11 px-4 rounded-control text-sm",
          "bg-[var(--color-ws-input)] text-[var(--color-ws-label)]",
          "placeholder:text-[var(--color-ws-placeholder)]",
          "ring-1 ring-inset ring-white/12",
          "transition-[box-shadow] duration-fast ease-ws",
          "ws-focus-ring",
          error ? "ring-[color-mix(in_srgb,var(--color-ws-negative)_55%,transparent)]" : "",
        ].join(" ")}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-[var(--color-ws-negative)]">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="text-sm text-[var(--color-ws-quaternary)]">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

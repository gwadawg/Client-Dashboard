"use client";

import type { ButtonHTMLAttributes } from "react";

type ButtonRole = "primary" | "secondary" | "destructive";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  roleStyle?: ButtonRole;
  /** Stretch to the parent width (auth forms). */
  block?: boolean;
};

const ROLE_CLASS: Record<ButtonRole, string> = {
  primary:
    "bg-[var(--color-ws-accent)] text-[var(--color-ws-base)] hover:bg-[var(--color-ws-accent-bright)]",
  secondary:
    "bg-white/6 text-[var(--color-ws-label)] ring-1 ring-inset ring-white/12 hover:bg-white/10",
  destructive:
    "bg-transparent text-[var(--color-ws-negative)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-ws-negative)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-ws-negative)_10%,transparent)]",
};

export default function Button({
  roleStyle = "primary",
  block = false,
  className = "",
  type = "button",
  children,
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-control text-sm font-semibold",
        "transition-[transform,background-color,opacity] duration-med ease-ws",
        "active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        "ws-focus-ring",
        block ? "w-full" : "",
        ROLE_CLASS[roleStyle],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

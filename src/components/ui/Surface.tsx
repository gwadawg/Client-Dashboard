import type { HTMLAttributes } from "react";

type Tone = "panel" | "input" | "grouped";

type Props = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
};

const TONE: Record<Tone, string> = {
  panel: "bg-[var(--color-ws-panel)]",
  input: "bg-[var(--color-ws-input)]",
  grouped: "bg-[var(--color-ws-grouped)]",
};

/** Opaque content-layer card. Not glass. */
export default function Surface({ tone = "panel", className = "", ...props }: Props) {
  return (
    <div
      className={[
        TONE[tone],
        "rounded-card ring-1 ring-inset ring-white/[0.07]",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

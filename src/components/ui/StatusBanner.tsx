type Tone = "error" | "success" | "info";

type Props = {
  tone?: Tone;
  children: string;
};

const TONE: Record<Tone, string> = {
  error:
    "text-[var(--color-ws-negative)] bg-[color-mix(in_srgb,var(--color-ws-negative)_10%,transparent)] ring-[color-mix(in_srgb,var(--color-ws-negative)_22%,transparent)]",
  success:
    "text-[var(--color-ws-positive)] bg-[color-mix(in_srgb,var(--color-ws-positive)_10%,transparent)] ring-[color-mix(in_srgb,var(--color-ws-positive)_22%,transparent)]",
  info:
    "text-[var(--color-ws-tertiary)] bg-white/5 ring-white/10",
};

export default function StatusBanner({ tone = "info", children }: Props) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-control px-3 py-2 text-sm ring-1 ring-inset ${TONE[tone]}`}
    >
      {children}
    </p>
  );
}

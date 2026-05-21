type Props = {
  label: string;
  value: string;
  accent?: boolean;
};

export default function KpiCard({ label, value, accent = false }: Props) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-5 flex flex-col gap-2 transition-all duration-200 hover:translate-y-[-1px] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{
        background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div
        className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
        style={{ background: accent ? "#f59e0b" : "#1d4ed8" }}
        aria-hidden
      />
      <span className="text-xs font-medium tracking-wide pl-3" style={{ color: "#64748b" }}>
        {label}
      </span>
      <span className="text-3xl font-bold pl-3 tabular-nums" style={{ color: "#f1f5f9" }}>
        {value}
      </span>
    </div>
  );
}

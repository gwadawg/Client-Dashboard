type Props = {
  label: string;
  value: string;
};

export default function KpiHeroCard({ label, value }: Props) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-8 md:p-10 flex flex-col gap-3"
      style={{
        background: "linear-gradient(135deg, #132a52 0%, #0c1a30 50%, #0a1628 100%)",
        border: "1px solid rgba(245,158,11,0.2)",
        boxShadow: "0 4px 24px rgba(245,158,11,0.08)",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
        style={{ background: "linear-gradient(90deg, #f59e0b, #d97706)" }}
        aria-hidden
      />
      <span className="text-sm font-semibold uppercase tracking-widest" style={{ color: "#94a3b8" }}>
        {label}
      </span>
      <span
        className="text-5xl md:text-6xl font-bold tabular-nums tracking-tight"
        style={{ color: "#f1f5f9" }}
      >
        {value}
      </span>
    </div>
  );
}

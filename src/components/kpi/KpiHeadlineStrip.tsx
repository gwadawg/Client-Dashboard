import KpiCard, { type KpiDelta } from "./KpiCard";

export type HeadlineMetric = {
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
  hint?: string;
  delta?: KpiDelta;
  spark?: (number | null)[];
  refLine?: string;
};

type Props = {
  metrics: HeadlineMetric[];
};

/**
 * The handful of numbers you actually open a client to check, pulled above the
 * 20-odd tiles below. Same tile as the sections, one size step up on its own
 * panel — the hierarchy comes from scale and surface, not a different design.
 */
export default function KpiHeadlineStrip({ metrics }: Props) {
  if (!metrics.length) return null;

  return (
    <section
      className="rounded-2xl p-3 md:p-4"
      style={{
        background: "linear-gradient(135deg, #132a52 0%, #0c1a30 55%, #0a1628 100%)",
        border: "1px solid rgba(245,158,11,0.18)",
        boxShadow: "0 4px 24px rgba(8,15,30,0.5)",
      }}
    >
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map(metric => (
          <KpiCard
            key={metric.label}
            size="hero"
            surface="rgba(8,15,30,0.55)"
            label={metric.label}
            value={metric.value}
            caption={metric.caption}
            accent={metric.accent}
            hint={metric.hint}
            delta={metric.delta}
            spark={metric.spark}
            refLine={metric.refLine}
          />
        ))}
      </div>
    </section>
  );
}

import type { MetricsResult } from "@/lib/metrics";
import {
  formatKpiValue,
  getKpiSections,
  type KpiCardDefinition,
  type ReportingType,
} from "@/lib/kpi-layouts";
import KpiCard, { type KpiDelta } from "./KpiCard";
import KpiHeroCard from "./KpiHeroCard";
import KpiSection from "./KpiSection";

export type SparkMap = Partial<Record<keyof MetricsResult, (number | null)[]>>;

type Props = {
  metrics: MetricsResult;
  reportingType: ReportingType;
  previous?: MetricsResult | null;
  spark?: SparkMap | null;
};

function computeDelta(
  card: KpiCardDefinition,
  current: number,
  previous: number,
): KpiDelta | undefined {
  // Skip noisy/meaningless comparisons (e.g. both zero).
  if (current === previous) return { text: "0%", good: null };

  let text: string;
  if (card.format === "pct") {
    const diff = current - previous;
    text = `${diff > 0 ? "+" : ""}${diff.toFixed(1)} pts`;
  } else if (previous === 0) {
    text = "new";
  } else {
    const relative = ((current - previous) / Math.abs(previous)) * 100;
    text = `${relative > 0 ? "+" : ""}${relative.toFixed(0)}%`;
  }

  const increased = current > previous;
  const good = card.lowerIsBetter ? !increased : increased;
  return { text, good };
}

function formatCardValue(card: KpiCardDefinition, metrics: MetricsResult): string {
  const primary = formatKpiValue(metrics[card.metric], card.format);
  if (!card.secondaryMetric) return primary;
  const secondary = formatKpiValue(metrics[card.secondaryMetric], card.format);
  return `${primary} / ${secondary}`;
}

export default function KpiSections({ metrics, reportingType, previous, spark }: Props) {
  const sections = getKpiSections(reportingType);

  return (
    <div className="space-y-8">
      {sections.map((section, sectionIndex) => {
        const visibleCards = section.cards.filter(
          card => !card.visible || card.visible(metrics),
        );
        if (visibleCards.length === 0) return null;

        const isHero = section.variant === "hero";

        return (
          <KpiSection
            key={section.title}
            title={section.title}
            footnote={section.footnote}
            showDivider={sectionIndex > 0}
          >
            {isHero ? (
              visibleCards.map(card => (
                <KpiHeroCard
                  key={card.label}
                  label={card.label}
                  value={formatCardValue(card, metrics)}
                />
              ))
            ) : (
              <div className={section.gridClassName}>
                {visibleCards.map(card => (
                  <KpiCard
                    key={`${section.title}-${card.label}`}
                    label={card.label}
                    value={formatCardValue(card, metrics)}
                    caption={card.valueCaption}
                    accent={card.accent}
                    hint={card.hint}
                    delta={
                      previous
                        ? computeDelta(card, metrics[card.metric], previous[card.metric])
                        : undefined
                    }
                    spark={
                      spark?.[card.metric] ??
                      (card.secondaryMetric ? spark?.[card.secondaryMetric] : undefined)
                    }
                  />
                ))}
              </div>
            )}
          </KpiSection>
        );
      })}
    </div>
  );
}

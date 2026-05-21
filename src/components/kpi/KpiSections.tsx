import type { MetricsResult } from "@/lib/metrics";
import {
  formatKpiValue,
  getKpiSections,
  type ReportingType,
} from "@/lib/kpi-layouts";
import KpiCard from "./KpiCard";
import KpiHeroCard from "./KpiHeroCard";
import KpiSection from "./KpiSection";

type Props = {
  metrics: MetricsResult;
  reportingType: ReportingType;
};

export default function KpiSections({ metrics, reportingType }: Props) {
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
                  value={formatKpiValue(metrics[card.metric], card.format)}
                />
              ))
            ) : (
              <div className={section.gridClassName}>
                {visibleCards.map(card => (
                  <KpiCard
                    key={`${section.title}-${card.label}`}
                    label={card.label}
                    value={formatKpiValue(metrics[card.metric], card.format)}
                    accent={card.accent}
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

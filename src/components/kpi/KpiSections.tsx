"use client";

import { useCallback, useMemo, useState } from "react";
import type { MetricsResult } from "@/lib/metrics";
import {
  formatKpiValue,
  getHeadlineCards,
  getKpiSections,
  type KpiCardDefinition,
  type ReportingType,
} from "@/lib/kpi-layouts";
import KpiCard, { type KpiDelta } from "./KpiCard";
import KpiHeadlineStrip, { type HeadlineMetric } from "./KpiHeadlineStrip";
import KpiHeroCard from "./KpiHeroCard";
import KpiSection from "./KpiSection";

const COLLAPSED_STORAGE_KEY = "mw.kpi.collapsedSections";

/** Section open/closed survives reloads, so your preferred depth is remembered. */
function readCollapsed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter(x => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

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

function formatRefLine(card: KpiCardDefinition, metrics: MetricsResult): string | undefined {
  if (!card.refMetric) return undefined;
  return `${card.refMetric.label} ${formatKpiValue(metrics[card.refMetric.metric], card.refMetric.format)}`;
}

export default function KpiSections({ metrics, reportingType, previous, spark }: Props) {
  const sections = getKpiSections(reportingType);
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

  const toggleSection = useCallback((title: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Non-persistent storage just means the sections reopen next session.
      }
      return next;
    });
  }, []);

  const describeCard = useCallback(
    (card: KpiCardDefinition): HeadlineMetric => ({
      label: card.label,
      value: formatCardValue(card, metrics),
      caption: card.valueCaption,
      accent: card.accent,
      hint: card.hint,
      refLine: formatRefLine(card, metrics),
      delta: previous
        ? computeDelta(card, metrics[card.metric], previous[card.metric])
        : undefined,
      spark:
        spark?.[card.metric] ??
        (card.secondaryMetric ? spark?.[card.secondaryMetric] : undefined),
    }),
    [metrics, previous, spark],
  );

  const headlineMetrics = useMemo(
    () =>
      getHeadlineCards(reportingType)
        .filter(card => !card.visible || card.visible(metrics))
        .map(describeCard),
    [reportingType, metrics, describeCard],
  );

  return (
    <div className="space-y-5">
      <KpiHeadlineStrip metrics={headlineMetrics} />

      {sections.map((section, sectionIndex) => {
        // Headline cards are lifted into the strip above, not repeated here.
        const visibleCards = section.cards.filter(
          card => !card.headline && (!card.visible || card.visible(metrics)),
        );
        if (visibleCards.length === 0) return null;

        const isHero = section.variant === "hero";
        const isCollapsed = collapsed.has(section.title);

        return (
          <KpiSection
            key={section.title}
            title={section.title}
            footnote={section.footnote}
            showDivider={sectionIndex > 0}
            open={!isCollapsed}
            onToggle={() => toggleSection(section.title)}
            meta={
              isCollapsed
                ? `${visibleCards.length} metric${visibleCards.length === 1 ? "" : "s"} hidden`
                : undefined
            }
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
                  <KpiCard key={`${section.title}-${card.label}`} {...describeCard(card)} />
                ))}
              </div>
            )}
          </KpiSection>
        );
      })}
    </div>
  );
}

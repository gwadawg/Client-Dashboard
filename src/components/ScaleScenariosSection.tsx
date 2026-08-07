"use client";

import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildContactRateCurve, buildSpendLadder } from "@/lib/lead-source-roi/scale";
import type { CompareState } from "@/lib/lead-source-roi/types";

const PANEL_BG = "linear-gradient(140deg, #0f2040 0%, #0b1830 60%, #0a1628 100%)";
const MUTED = "#64748b";
const LABEL = "#94a3b8";
const TEXT = "#e2e8f0";
const AMBER = "#f59e0b";
const SLATE_LINE = "#64748b";
const GOOD = "#22c55e";
const BORDER = "1px solid rgba(255,255,255,0.07)";
const GRID = "rgba(148,163,184,0.12)";
/** Recharts defaults to -1×-1 and warns on first measure — seed a real size instead. */
const CHART_INITIAL = { width: 640, height: 288 };

function money(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function compactMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  // Below $10k a tick can land off a round thousand — keep a decimal so
  // $1,200 doesn't render as "$1k" next to $1,600 rendering as "$2k".
  if (abs >= 10_000) return `$${Math.round(n / 1_000)}k`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${Math.round(n)}`;
}

function num(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 100) return Math.round(n).toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function Panel({
  eyebrow,
  title,
  blurb,
  children,
  right,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: PANEL_BG, border: BORDER }}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: AMBER }}>
            {eyebrow}
          </p>
          <h3 className="text-base font-semibold mt-1" style={{ color: TEXT }}>
            {title}
          </h3>
          <p className="text-xs mt-1 max-w-xl leading-relaxed" style={{ color: MUTED }}>
            {blurb}
          </p>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function StatChip({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 min-w-0 flex flex-col"
      style={{ background: "rgba(10,22,40,0.7)", border: BORDER }}
    >
      {/* Two-line floor keeps values aligned across a row when a label wraps. */}
      <p
        className="text-[10px] uppercase tracking-wide leading-snug min-h-[2.75em]"
        style={{ color: MUTED }}
      >
        {label}
      </p>
      <p
        className="text-xl font-semibold tabular-nums mt-0.5 truncate"
        style={{ color: accent || TEXT }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[10px] mt-auto pt-0.5 leading-snug" style={{ color: MUTED }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelSuffix,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  formatter: (v: number, name: string) => string;
  labelSuffix?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{ background: "#132038", border: "1px solid rgba(255,255,255,0.14)" }}
    >
      <p className="font-medium mb-1" style={{ color: TEXT }}>
        {label}
        {labelSuffix?.(String(label ?? ""))}
      </p>
      {payload.map((p, i) => (
        <p key={i} className="tabular-nums" style={{ color: p.color || LABEL }}>
          {p.name}: {formatter(Number(p.value), String(p.name))}
        </p>
      ))}
    </div>
  );
}

/** Two-line tick so the multiplier and its budget never collide on narrow widths. */
function SpendTick({
  x,
  y,
  payload,
  spendByLabel,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  spendByLabel: Record<string, string>;
}) {
  const label = String(payload?.value ?? "");
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text textAnchor="middle" dy={12} fontSize={11} fill={LABEL} fontWeight={600}>
        {label}
      </text>
      <text textAnchor="middle" dy={26} fontSize={10} fill={MUTED}>
        {spendByLabel[label] ?? ""}
      </text>
    </g>
  );
}

export default function ScaleScenariosSection({ state }: { state: CompareState }) {
  const ladder = useMemo(() => buildSpendLadder(state), [state]);
  const ladderData = useMemo(
    () =>
      ladder.map((r) => ({
        label: r.label,
        spendLabel: compactMoney(r.spend),
        Current: Math.round(r.currentNet),
        "With Waiz": Math.round(r.waizNet),
        Gain: Math.round(r.deltaNet),
      })),
    [ladder],
  );

  const spendByLabel = useMemo(
    () =>
      Object.fromEntries(ladder.map((r) => [r.label, compactMoney(r.spend)])) as Record<
        string,
        string
      >,
    [ladder],
  );

  const { ad_spend: curveSpend, leads: curveLeads } = state.current;
  const curve = useMemo(
    () =>
      buildContactRateCurve(curveSpend, curveLeads).map((p) => ({
        label: `${p.contactRatePct}%`,
        pct: p.contactRatePct,
        "Cost / conversation": p.costPerConversation
          ? Math.round(p.costPerConversation)
          : null,
      })),
    [curveSpend, curveLeads],
  );

  const topRung = ladder[ladder.length - 1];
  const baseRung = ladder.find((r) => r.multiplier === 1) ?? ladder[0];

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Scale scenarios"
        title="What happens when you put more budget through a better engine"
        blurb="Same CPL and rates on each side — only the media budget moves. The gap is not fixed: every dollar you add compounds the difference between the two lead sources."
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL}>
            <ComposedChart data={ladderData} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
              <defs>
                <linearGradient id="waizBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="currentBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#475569" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#334155" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                interval={0}
                height={38}
                tick={<SpendTick spendByLabel={spendByLabel} />}
                axisLine={{ stroke: GRID }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => compactMoney(Number(v))}
                width={54}
              />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.08)" }}
                content={
                  <ChartTooltip
                    formatter={(v) => money(v)}
                    labelSuffix={(l) => ` spend · ${spendByLabel[l] ?? ""}`}
                  />
                }
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ fontSize: 11, color: LABEL, paddingBottom: 8 }}
                iconType="circle"
              />
              <Bar dataKey="Current" fill="url(#currentBar)" radius={[6, 6, 0, 0]} maxBarSize={44} />
              <Bar dataKey="With Waiz" fill="url(#waizBar)" radius={[6, 6, 0, 0]} maxBarSize={44} />
              <Line
                type="monotone"
                dataKey="Gain"
                stroke={GOOD}
                strokeWidth={2.5}
                dot={{ r: 3, fill: GOOD, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
          <StatChip
            label="Gain at today's spend"
            value={money(baseRung?.deltaNet ?? 0)}
            accent={GOOD}
            sub={`at ${compactMoney(baseRung?.spend ?? 0)} / mo`}
          />
          <StatChip
            label={`Gain at ${topRung?.label ?? "3×"} spend`}
            value={money(topRung?.deltaNet ?? 0)}
            accent={GOOD}
            sub={`at ${compactMoney(topRung?.spend ?? 0)} / mo`}
          />
          <StatChip
            label={`Extra deals at ${topRung?.label ?? "3×"}`}
            value={num((topRung?.waizDeals ?? 0) - (topRung?.currentDeals ?? 0))}
            accent={AMBER}
            sub="vs their source, same budget"
          />
          <StatChip
            label="Waiz ROI at top rung"
            value={
              topRung?.waizRoiMultiple != null
                ? `${topRung.waizRoiMultiple.toFixed(2)}×`
                : "—"
            }
            sub="gross commission ÷ investment"
          />
        </div>
      </Panel>

      <Panel
        eyebrow="The hidden cost of low pickup"
        title="Cheap leads you never reach are the expensive ones"
        blurb="Hold spend flat and slide the contact rate. The fewer leads you actually reach, the more every conversation costs you — same budget, fewer shots at closing."
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL}>
            <ComposedChart data={curve} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
              <defs>
                <linearGradient id="costArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={{ stroke: GRID }}
                tickLine={false}
                label={{
                  value: "Contact rate",
                  position: "insideBottom",
                  offset: -14,
                  fill: MUTED,
                  fontSize: 10,
                }}
              />
              <YAxis
                yAxisId="cost"
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => compactMoney(Number(v))}
                width={54}
              />
              <Tooltip
                cursor={{ stroke: GRID }}
                content={<ChartTooltip formatter={(v) => money(v)} />}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ fontSize: 11, color: LABEL, paddingBottom: 8 }}
                iconType="circle"
              />
              <Area
                yAxisId="cost"
                type="monotone"
                dataKey="Cost / conversation"
                stroke="#ef4444"
                strokeWidth={2.5}
                fill="url(#costArea)"
              />
              <ReferenceDot
                yAxisId="cost"
                x={`${Math.round(state.current.contact_rate_pct / 5) * 5}%`}
                y={
                  curve.find(
                    (p) => p.pct === Math.round(state.current.contact_rate_pct / 5) * 5,
                  )?.["Cost / conversation"] ?? undefined
                }
                r={6}
                fill={SLATE_LINE}
                stroke="#e2e8f0"
                strokeWidth={2}
              />
              <ReferenceDot
                yAxisId="cost"
                x={`${Math.round(state.waiz.contact_rate_pct / 5) * 5}%`}
                y={
                  curve.find(
                    (p) => p.pct === Math.round(state.waiz.contact_rate_pct / 5) * 5,
                  )?.["Cost / conversation"] ?? undefined
                }
                r={6}
                fill={AMBER}
                stroke="#fff7ed"
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] mt-2" style={{ color: MUTED }}>
          Dots mark where each side sits today — grey is their source, amber is Waiz.
        </p>
      </Panel>
    </div>
  );
}

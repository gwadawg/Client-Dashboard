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
import { BORDER, R, T } from "@/lib/lead-source-roi/theme";

const GRID = "rgba(148,163,184,0.09)";
/** Recharts defaults to -1×-1 and warns on first measure — seed a real size instead. */
const CHART_INITIAL = { width: 640, height: 288 };
const MONO = "var(--font-data), ui-monospace, monospace";

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
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ background: T.panel, border: BORDER, borderRadius: R }}>
      <header className="px-5 py-4" style={{ borderBottom: `1px solid ${T.ruleSoft}` }}>
        <span
          className="text-[10px] font-semibold uppercase"
          style={{ color: T.amber, letterSpacing: "0.13em" }}
        >
          {eyebrow}
        </span>
        <h3
          className="text-[15px] font-bold mt-1.5"
          style={{ color: T.hi, letterSpacing: "-0.005em" }}
        >
          {title}
        </h3>
        <p className="text-[12px] mt-1.5 max-w-2xl leading-relaxed" style={{ color: T.mid }}>
          {blurb}
        </p>
      </header>
      <div className="p-5">{children}</div>
    </section>
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
      className="px-3.5 py-3 min-w-0 flex flex-col"
      style={{ background: T.base, border: BORDER, borderRadius: R }}
    >
      {/* Two-line floor keeps values aligned across a row when a label wraps. */}
      <p
        className="text-[9px] font-semibold uppercase leading-snug min-h-[2.75em]"
        style={{ color: T.low, letterSpacing: "0.1em" }}
      >
        {label}
      </p>
      <p
        className="lsr-data text-xl font-semibold mt-0.5 truncate"
        style={{ color: accent || T.hi }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[10px] mt-auto pt-1 leading-snug" style={{ color: T.low }}>
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
      className="px-3 py-2 text-xs shadow-2xl"
      style={{ background: T.raised, border: `1px solid ${T.ruleStrong}`, borderRadius: R }}
    >
      <p
        className="text-[10px] font-semibold uppercase mb-1.5"
        style={{ color: T.mid, letterSpacing: "0.1em" }}
      >
        {label}
        {labelSuffix?.(String(label ?? ""))}
      </p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-[12px]">
          <span style={{ color: T.mid }}>{p.name}</span>
          <span className="lsr-data font-semibold ml-auto" style={{ color: p.color || T.hi }}>
            {formatter(Number(p.value), String(p.name))}
          </span>
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
      <text
        textAnchor="middle"
        dy={13}
        fontSize={12}
        fontFamily={MONO}
        fill={T.hi}
        fontWeight={600}
      >
        {label}
      </text>
      <text textAnchor="middle" dy={27} fontSize={10} fontFamily={MONO} fill={T.low}>
        {spendByLabel[label] ?? ""}
      </text>
    </g>
  );
}

const AXIS_TICK = { fill: T.low, fontSize: 11, fontFamily: MONO };

export default function ScaleScenariosSection({ state }: { state: CompareState }) {
  const ladder = useMemo(() => buildSpendLadder(state), [state]);
  const ladderData = useMemo(
    () =>
      ladder.map((r) => ({
        label: r.label,
        spendLabel: compactMoney(r.spend),
        Theirs: Math.round(r.currentNet),
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
        blurb="Same CPL and rates on each side — only the media budget moves. The gap is not fixed: every dollar added compounds the difference between the two lead sources."
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL}>
            <ComposedChart data={ladderData} margin={{ top: 8, right: 8, left: 4, bottom: 18 }}>
              <defs>
                <linearGradient id="waizBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FBBF24" stopOpacity={1} />
                  <stop offset="100%" stopColor={T.amber} stopOpacity={0.42} />
                </linearGradient>
                <linearGradient id="currentBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3E4C63" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#2A3648" stopOpacity={0.45} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                interval={0}
                height={38}
                tick={<SpendTick spendByLabel={spendByLabel} />}
                axisLine={{ stroke: T.rule }}
                tickLine={false}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => compactMoney(Number(v))}
                width={56}
              />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.06)" }}
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
                wrapperStyle={{ fontSize: 11, color: T.mid, paddingBottom: 10 }}
                iconType="square"
                iconSize={9}
              />
              <Bar dataKey="Theirs" fill="url(#currentBar)" radius={[2, 2, 0, 0]} maxBarSize={46} />
              <Bar dataKey="With Waiz" fill="url(#waizBar)" radius={[2, 2, 0, 0]} maxBarSize={46} />
              <Line
                type="monotone"
                dataKey="Gain"
                stroke={T.good}
                strokeWidth={2}
                dot={{ r: 2.5, fill: T.good, strokeWidth: 0 }}
                activeDot={{ r: 4.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
          <StatChip
            label="Gain at today's spend"
            value={money(baseRung?.deltaNet ?? 0)}
            accent={T.good}
            sub={`at ${compactMoney(baseRung?.spend ?? 0)} / mo`}
          />
          <StatChip
            label={`Gain at ${topRung?.label ?? "3×"} spend`}
            value={money(topRung?.deltaNet ?? 0)}
            accent={T.good}
            sub={`at ${compactMoney(topRung?.spend ?? 0)} / mo`}
          />
          <StatChip
            label={`Extra deals at ${topRung?.label ?? "3×"}`}
            value={num((topRung?.waizDeals ?? 0) - (topRung?.currentDeals ?? 0))}
            accent={T.amber}
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
                  <stop offset="0%" stopColor={T.bad} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={T.bad} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={{ stroke: T.rule }}
                tickLine={false}
                label={{
                  value: "CONTACT RATE",
                  position: "insideBottom",
                  offset: -14,
                  fill: T.low,
                  fontSize: 9,
                  letterSpacing: "0.13em",
                }}
              />
              <YAxis
                yAxisId="cost"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => compactMoney(Number(v))}
                width={56}
              />
              <Tooltip
                cursor={{ stroke: T.rule }}
                content={<ChartTooltip formatter={(v) => money(v)} />}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ fontSize: 11, color: T.mid, paddingBottom: 10 }}
                iconType="square"
                iconSize={9}
              />
              <Area
                yAxisId="cost"
                type="monotone"
                dataKey="Cost / conversation"
                stroke={T.bad}
                strokeWidth={2}
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
                r={5}
                fill={T.panel}
                stroke={T.mid}
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
                r={5.5}
                fill={T.amber}
                stroke={T.base}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] mt-3" style={{ color: T.low }}>
          Dots mark where each side sits today — grey is their source, amber is Waiz.
        </p>
      </Panel>
    </div>
  );
}

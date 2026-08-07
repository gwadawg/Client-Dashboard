"use client";

import { useMemo, useState } from "react";
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
import {
  buildContactRateCurve,
  buildSpendLadder,
  computeEffort,
  DEFAULT_EFFORT,
  type EffortAssumptions,
} from "@/lib/lead-source-roi/scale";
import type { CompareState } from "@/lib/lead-source-roi/types";

const PANEL_BG = "linear-gradient(140deg, #0f2040 0%, #0b1830 60%, #0a1628 100%)";
const INPUT_BG = "#0f2040";
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
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
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

/** Proportional bar comparing outreach grind between the two sides. */
function EffortBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div
      className="mt-3 h-1.5 rounded-full overflow-hidden"
      style={{ background: "rgba(148,163,184,0.15)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(3, ratio * 100))}%`, background: color }}
      />
    </div>
  );
}

function MiniNumber({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px]" style={{ color: MUTED }}>
      {label}
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-14 py-1 px-2 rounded-md text-xs tabular-nums outline-none"
        style={{
          background: INPUT_BG,
          border: "1px solid rgba(255,255,255,0.12)",
          color: TEXT,
        }}
      />
      {suffix}
    </label>
  );
}

export default function ScaleScenariosSection({ state }: { state: CompareState }) {
  const [effort, setEffort] = useState<EffortAssumptions>(DEFAULT_EFFORT);

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

  const currentEffort = useMemo(
    () => computeEffort(state.current.leads, state.current.contact_rate_pct, effort),
    [state.current.leads, state.current.contact_rate_pct, effort],
  );
  const waizEffort = useMemo(
    () => computeEffort(state.waiz.leads, state.waiz.contact_rate_pct, effort),
    [state.waiz.leads, state.waiz.contact_rate_pct, effort],
  );

  const curve = useMemo(
    () =>
      buildContactRateCurve(
        state.current.ad_spend,
        state.current.leads,
        effort,
      ).map((p) => ({
        label: `${p.contactRatePct}%`,
        pct: p.contactRatePct,
        "Cost / conversation": p.costPerConversation
          ? Math.round(p.costPerConversation)
          : null,
        "Touches / conversation": p.touchesPerConversation
          ? Math.round(p.touchesPerConversation)
          : null,
      })),
    [state.current.ad_spend, state.current.leads, effort],
  );

  const topRung = ladder[ladder.length - 1];
  const baseRung = ladder.find((r) => r.multiplier === 1) ?? ladder[0];
  const hoursSaved =
    currentEffort.hoursPerConversation != null && waizEffort.hoursPerConversation != null
      ? currentEffort.hoursPerConversation - waizEffort.hoursPerConversation
      : null;
  const maxTouches = Math.max(
    currentEffort.touchesPerConversation ?? 0,
    waizEffort.touchesPerConversation ?? 0,
    1,
  );
  const touchesSaved =
    currentEffort.touchesPerConversation != null && waizEffort.touchesPerConversation != null
      ? currentEffort.touchesPerConversation - waizEffort.touchesPerConversation
      : null;

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
        blurb="Hold spend flat and slide the contact rate. Cost per conversation and the dials/texts to get one live person move together — poor pickup taxes both your budget and your calendar."
        right={
          <div className="flex flex-wrap gap-3 shrink-0">
            <MiniNumber
              label="Touches / lead"
              value={effort.touchesPerLead}
              suffix=""
              onChange={(v) => setEffort((e) => ({ ...e, touchesPerLead: v }))}
            />
            <MiniNumber
              label="Min / touch"
              value={effort.minutesPerTouch}
              suffix="min"
              onChange={(v) => setEffort((e) => ({ ...e, minutesPerTouch: v }))}
            />
          </div>
        }
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
              <YAxis
                yAxisId="touch"
                orientation="right"
                tick={{ fill: MUTED, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: GRID }}
                content={
                  <ChartTooltip
                    formatter={(v, name) =>
                      name.startsWith("Cost") ? money(v) : `${num(v, 0)} touches`
                    }
                  />
                }
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
              <Line
                yAxisId="touch"
                type="monotone"
                dataKey="Touches / conversation"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
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

      <Panel
        eyebrow="Return on your time"
        title="Less dialing and texting for every live conversation"
        blurb="Contact rate is a labor number as much as a cost number. Better pickup means fewer touches burned before someone answers — the same rep hours produce more real conversations."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl p-4" style={{ background: "rgba(10,22,40,0.7)", border: BORDER }}>
            <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: MUTED }}>
              Their source
            </p>
            <p className="text-3xl font-semibold tabular-nums" style={{ color: TEXT }}>
              {num(currentEffort.touchesPerConversation, 0)}
            </p>
            <p className="text-[11px] mt-1" style={{ color: LABEL }}>
              touches per conversation
            </p>
            <p className="text-[11px] mt-2" style={{ color: MUTED }}>
              {num(currentEffort.leadsPerConversation)} leads worked ·{" "}
              {num(currentEffort.hoursPerConversation)} hrs each
            </p>
            <EffortBar
              ratio={(currentEffort.touchesPerConversation ?? 0) / maxTouches}
              color={SLATE_LINE}
            />
          </div>

          <div
            className="rounded-xl p-4"
            style={{
              background: "linear-gradient(140deg, rgba(245,158,11,0.16), rgba(10,22,40,0.85))",
              border: "1px solid rgba(245,158,11,0.3)",
            }}
          >
            <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: AMBER }}>
              With Waiz
            </p>
            <p className="text-3xl font-semibold tabular-nums" style={{ color: AMBER }}>
              {num(waizEffort.touchesPerConversation, 0)}
            </p>
            <p className="text-[11px] mt-1" style={{ color: LABEL }}>
              touches per conversation
            </p>
            <p className="text-[11px] mt-2" style={{ color: MUTED }}>
              {num(waizEffort.leadsPerConversation)} leads worked ·{" "}
              {num(waizEffort.hoursPerConversation)} hrs each
            </p>
            <EffortBar
              ratio={(waizEffort.touchesPerConversation ?? 0) / maxTouches}
              color={AMBER}
            />
          </div>

          <div className="rounded-xl p-4" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: GOOD }}>
              You get back
            </p>
            <p className="text-3xl font-semibold tabular-nums" style={{ color: GOOD }}>
              {touchesSaved != null && touchesSaved > 0 ? num(touchesSaved, 0) : "—"}
            </p>
            <p className="text-[11px] mt-1" style={{ color: LABEL }}>
              fewer touches per conversation
            </p>
            <p className="text-[11px] mt-2" style={{ color: MUTED }}>
              {hoursSaved != null && hoursSaved > 0
                ? `${num(hoursSaved)} hrs saved for every conversation you land`
                : "Raise the Waiz contact rate to see the time saved"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          <StatChip
            label="Conversations · their source"
            value={num(currentEffort.conversations)}
            sub="at current leads"
          />
          <StatChip
            label="Conversations · Waiz"
            value={num(waizEffort.conversations)}
            accent={AMBER}
            sub="same budget"
          />
          <StatChip
            label="Extra conversations"
            value={num(waizEffort.conversations - currentEffort.conversations)}
            accent={GOOD}
            sub="more shots at closing"
          />
          <StatChip
            label="Assumption"
            value={`${effort.touchesPerLead} × ${effort.minutesPerTouch}m`}
            sub="touches per lead × minutes each"
          />
        </div>
      </Panel>
    </div>
  );
}

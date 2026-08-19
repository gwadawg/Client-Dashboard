"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  DIAGNOSIS_COLORS,
  DIAGNOSIS_LABELS,
  PRODUCT_LABELS,
  type CreativeIntelRow,
} from "@/lib/ad-creative-lenses";
import { Empty, Panel, deltaText, money } from "./ui";

type Point = {
  x: number;
  y: number;
  z: number;
  name: string;
  color: string;
  diagnosis: string;
  product: string;
  spend: number;
  rowKey: string;
};

/**
 * CTR movement against CPCONV movement. The quadrants are the diagnosis:
 * bottom-left is creative wear (people stopped clicking and cost rose), top-left
 * is a funnel or ops problem (they still click, the cost still rose), and the
 * right half is holding or improving.
 */
export default function FatigueQuadrant({
  ads,
  onOpen,
}: {
  ads: CreativeIntelRow[];
  onOpen: (ad: CreativeIntelRow) => void;
}) {
  const byKey = useMemo(() => new Map(ads.map((a) => [a.row_key, a])), [ads]);

  const points = useMemo<Point[]>(
    () =>
      ads
        .filter((a) => a.signal && a.ctr_delta_pct != null && a.cpconv_delta_pct != null)
        .map((a) => ({
          x: clampAxis(a.ctr_delta_pct!),
          y: clampAxis(a.cpconv_delta_pct!),
          z: Math.max(a.spend, 1),
          name: a.ad_name,
          color: DIAGNOSIS_COLORS[a.diagnosis],
          diagnosis: DIAGNOSIS_LABELS[a.diagnosis],
          product: PRODUCT_LABELS[a.product],
          spend: a.spend,
          rowKey: a.row_key,
        })),
    [ads],
  );

  return (
    <Panel
      title="Fatigue quadrant"
      hint="Signal ads only, trailing block versus the one before it. Left half means clicks fell; top half means conversations got more expensive."
    >
      {points.length === 0 ? (
        <Empty>
          No ad has both a trailing and a prior block with enough delivery to compare. Widen the date
          range.
        </Empty>
      ) : (
        <>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 16, left: 4, bottom: 12 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="CTR change"
                  domain={[-100, 100]}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  tickFormatter={(v: number) => `${v}%`}
                  label={{
                    value: "CTR change",
                    position: "insideBottom",
                    offset: -6,
                    fill: "#475569",
                    fontSize: 10,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="CPCONV change"
                  domain={[-100, 100]}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  tickFormatter={(v: number) => `${v}%`}
                  width={48}
                  label={{
                    value: "CPCONV change",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#475569",
                    fontSize: 10,
                  }}
                />
                <ZAxis type="number" dataKey="z" range={[40, 480]} />
                <ReferenceLine x={0} stroke="rgba(255,255,255,0.18)" />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
                <Tooltip
                  cursor={{ stroke: "rgba(255,255,255,0.12)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as Point;
                    return (
                      <div
                        className="rounded-lg px-3 py-2 text-xs"
                        style={{
                          background: "var(--color-ws-chrome)",
                          border: "1px solid var(--color-ws-hairline)",
                          fontFamily: "var(--font-data), monospace",
                        }}
                      >
                        <p style={{ color: "var(--color-ws-text-loud)" }}>{p.name}</p>
                        <p style={{ color: p.color }}>
                          {p.diagnosis} · {p.product}
                        </p>
                        <p style={{ color: "var(--color-ws-text-muted)" }}>
                          CTR {deltaText(p.x)} · CPCONV {deltaText(p.y)} · {money(p.spend)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={points}
                  onClick={(p: unknown) => {
                    const point = (p as { rowKey?: string })?.rowKey;
                    const ad = point ? byKey.get(point) : undefined;
                    if (ad) onOpen(ad);
                  }}
                  cursor="pointer"
                >
                  {points.map((p) => (
                    <Cell key={p.rowKey} fill={p.color} fillOpacity={0.55} stroke={p.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <QuadrantNote
              corner="Top left"
              color={DIAGNOSIS_COLORS.creative_fatigue}
              text="Clicks fell and conversations cost more — creative wear."
            />
            <QuadrantNote
              corner="Top right"
              color={DIAGNOSIS_COLORS.funnel_or_ops}
              text="Clicks held but conversations cost more — landing, speed-to-lead or one account."
            />
            <QuadrantNote
              corner="Bottom left"
              color="#94a3b8"
              text="Clicks fell but conversations got cheaper — narrower reach, better fit."
            />
            <QuadrantNote
              corner="Bottom right"
              color={DIAGNOSIS_COLORS.scaled}
              text="Clicks up and conversations cheaper — this is where you want budget."
            />
          </div>
        </>
      )}
    </Panel>
  );
}

/** Extreme swings on tiny denominators would flatten everything else. */
function clampAxis(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v)));
}

function QuadrantNote({ corner, color, text }: { corner: string; color: string; text: string }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0" style={{ background: color }} />
      <p className="text-[10px] leading-snug" style={{ color: "var(--color-ws-text-dim)" }}>
        <span style={{ color: "var(--color-ws-text-muted)" }}>{corner}.</span> {text}
      </p>
    </div>
  );
}

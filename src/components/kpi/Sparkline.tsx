type Props = {
  data: (number | null)[];
  color?: string;
  className?: string;
};

const VIEW_W = 100;
const VIEW_H = 28;
const PAD = 3;

/**
 * True when a series is worth drawing. Two points or a dead-flat line produce a
 * scratch that reads as noise on a dense grid, so those cards render no chart.
 */
export function sparkHasSignal(data?: (number | null)[] | null): boolean {
  if (!data) return false;
  const points = data.filter((v): v is number => v != null);
  if (points.length < 4) return false;
  return Math.max(...points) !== Math.min(...points);
}

/**
 * Tiny inline trend line for a KPI tile. Hand-rolled SVG so it stays cheap
 * across many cards. Gaps in the series are closed rather than drawn as broken
 * dashes — at 28px tall this is a direction cue, not a readable time axis.
 */
export default function Sparkline({ data, color = "#3b82f6", className }: Props) {
  const points = data.filter((v): v is number => v != null);
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const usableH = VIEW_H - PAD * 2;

  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * VIEW_W;
    const y = PAD + usableH - ((v - min) / range) * usableH;
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;

  // Same colour always yields the same gradient, so a shared id across tiles is
  // harmless and avoids a per-instance hook.
  const gradientId = `spark-fill-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.85}
      />
    </svg>
  );
}

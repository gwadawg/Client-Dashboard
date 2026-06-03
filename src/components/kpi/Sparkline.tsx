type Props = {
  data: (number | null)[];
  color?: string;
  width?: number;
  height?: number;
};

/**
 * Tiny inline trend line (no axes/labels) for a KPI card. Hand-rolled SVG so it
 * stays cheap to render across many cards. Nulls (no data that day) break the line.
 */
export default function Sparkline({ data, color = "#3b82f6", width = 120, height = 28 }: Props) {
  const points = data.filter((v): v is number => v != null);
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const pad = 2;
  const usableH = height - pad * 2;

  // Build path, breaking on nulls.
  let d = "";
  let penDown = false;
  data.forEach((v, i) => {
    if (v == null) {
      penDown = false;
      return;
    }
    const x = i * stepX;
    const y = pad + usableH - ((v - min) / range) * usableH;
    d += `${penDown ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    penDown = true;
  });

  const lastVal = points[points.length - 1];
  const lastIdx = (() => {
    for (let i = data.length - 1; i >= 0; i--) if (data[i] != null) return i;
    return data.length - 1;
  })();
  const lastX = lastIdx * stepX;
  const lastY = pad + usableH - ((lastVal - min) / range) * usableH;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path d={d.trim()} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}

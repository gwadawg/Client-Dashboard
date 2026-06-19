// Color thresholds for acquisition KPI rates.
// Each metric has good/warn boundaries (percent values).
// Anything below warn = red, warn to good = amber, good and above = green.

export type ThresholdColor = 'green' | 'amber' | 'red' | 'neutral';

export type Threshold = {
  good: number; // >= good → green
  warn: number; // >= warn → amber, < warn → red
};

export const DEFAULT_THRESHOLDS: Record<string, Threshold> = {
  intro_show_rate:    { good: 70, warn: 50 },
  demo_show_rate:     { good: 70, warn: 50 },
  intro_booking_rate: { good: 50, warn: 30 },
  demo_booking_rate:  { good: 60, warn: 40 },
  offer_rate:         { good: 70, warn: 50 },
  close_rate:         { good: 50, warn: 30 },
  demo_to_close_rate: { good: 35, warn: 20 },
  overall_show_rate:  { good: 70, warn: 50 },
};

export function rateColor(
  metricKey: string,
  value: number | null | undefined,
  overrides?: Partial<Record<string, Threshold>>,
): ThresholdColor {
  if (value == null || !Number.isFinite(value)) return 'neutral';
  const thresholds = { ...DEFAULT_THRESHOLDS, ...overrides };
  const t = thresholds[metricKey];
  if (!t) return 'neutral';
  if (value >= t.good) return 'green';
  if (value >= t.warn) return 'amber';
  return 'red';
}

export const THRESHOLD_COLORS: Record<ThresholdColor, string> = {
  green:   '#3ecf8e',
  amber:   '#f0a832',
  red:     '#e84040',
  neutral: '#94a3b8',
};

export function thresholdStyle(color: ThresholdColor): { color: string } {
  return { color: THRESHOLD_COLORS[color] };
}

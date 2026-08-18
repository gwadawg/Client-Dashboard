/** Work-log taxonomy: findings, cadence, bets. */

export const WORK_TYPES = ['finding', 'cadence', 'bet'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_TYPE_META: Record<
  WorkType,
  { label: string; hint: string; color: string; chartDefaultOn: boolean }
> = {
  finding: {
    label: 'Finding',
    hint: 'Discovery — not a change. Audit notes, issues reported.',
    color: '#fbbf24',
    chartDefaultOn: false,
  },
  cadence: {
    label: 'Cadence',
    hint: 'Expected hygiene — killed ads, budget pacing, QA.',
    color: '#94a3b8',
    chartDefaultOn: false,
  },
  bet: {
    label: 'Bet',
    hint: 'Hypothesized KPI mover. Measured from live date → review.',
    color: '#60a5fa',
    chartDefaultOn: true,
  },
};

export const DEFAULT_LAYER_TOGGLES: Record<WorkType, boolean> = {
  finding: false,
  cadence: false,
  bet: true,
};

export const LAYER_TOGGLE_STORAGE_KEY = 'cs-work-log-layers';

export function isWorkType(v: unknown): v is WorkType {
  return typeof v === 'string' && (WORK_TYPES as readonly string[]).includes(v);
}

export function parseWorkType(v: unknown, fallback: WorkType): WorkType {
  return isWorkType(v) ? v : fallback;
}

export type WorkLogDateInput = {
  workType: WorkType;
  status: string;
  changeDate: string | null;
  plannedDate: string | null;
  today: string;
};

export type WorkLogDates = {
  changeDate: string | null;
  plannedDate: string | null;
};

/** Resolve planned vs live dates. Planned bets never stamp change_date. */
export function resolveWorkLogDates(input: WorkLogDateInput): WorkLogDates {
  const { workType, status, today } = input;
  const changeDate = emptyToNull(input.changeDate);
  const plannedDate = emptyToNull(input.plannedDate);

  if (workType === 'finding') {
    return { changeDate: changeDate ?? today, plannedDate };
  }

  if (workType === 'cadence') {
    if (status === 'planned') {
      return { changeDate, plannedDate: plannedDate ?? today };
    }
    return { changeDate: changeDate ?? today, plannedDate };
  }

  if (status === 'planned') {
    return { changeDate: null, plannedDate: plannedDate ?? today };
  }
  return { changeDate: changeDate ?? today, plannedDate };
}

export function shouldFreezeBaseline(
  workType: WorkType,
  changeDate: string | null,
  status: string,
): boolean {
  return workType === 'bet' && Boolean(changeDate) && status !== 'planned';
}

export function isBetWorkType(workType: string | null | undefined): boolean {
  return (workType ?? 'bet') === 'bet';
}

/** Date the chart/strip should plot: live date, else planned (ghost). */
export function workLogPlotDate(action: {
  change_date?: string | null;
  planned_date?: string | null;
}): string | null {
  return emptyToNull(action.change_date) ?? emptyToNull(action.planned_date);
}

/** Thursday week match: live, else planned, else created day. */
export function workLogWeekDate(action: {
  change_date?: string | null;
  planned_date?: string | null;
  created_at?: string | null;
}): string | null {
  return workLogPlotDate(action) ?? ymdPrefix(action.created_at);
}

export const LOG_WORK_PERMISSIONS = [
  'client_workspace',
  'client_health',
  'media_buyer',
] as const;

export function isGhostMark(action: { change_date?: string | null }): boolean {
  return !emptyToNull(action.change_date);
}

export function parseLayerToggles(raw: string | null): Record<WorkType, boolean> {
  if (!raw) return { ...DEFAULT_LAYER_TOGGLES };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<WorkType, unknown>>;
    return {
      finding: typeof parsed.finding === 'boolean' ? parsed.finding : DEFAULT_LAYER_TOGGLES.finding,
      cadence: typeof parsed.cadence === 'boolean' ? parsed.cadence : DEFAULT_LAYER_TOGGLES.cadence,
      bet: typeof parsed.bet === 'boolean' ? parsed.bet : DEFAULT_LAYER_TOGGLES.bet,
    };
  } catch {
    return { ...DEFAULT_LAYER_TOGGLES };
  }
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t : null;
}

function ymdPrefix(v: string | null | undefined): string | null {
  const t = emptyToNull(v);
  return t ? t.slice(0, 10) : null;
}

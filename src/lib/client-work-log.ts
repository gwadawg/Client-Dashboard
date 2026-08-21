/** Work-log taxonomy: findings, cadence, bets. */

export const WORK_TYPES = ['finding', 'cadence', 'bet'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export type WorkTypeMeta = {
  label: string;
  /** One-line summary under the selected type. */
  hint: string;
  /** Hover / title text: when to use, examples, what not to use. */
  tooltip: string;
  color: string;
  chartDefaultOn: boolean;
};

export const WORK_TYPE_META: Record<WorkType, WorkTypeMeta> = {
  finding: {
    label: 'Finding',
    hint: 'Discovery — we saw it; nothing changed yet.',
    tooltip:
      'Use when you spotted a problem but did not change the funnel yet.\n\n' +
      'Examples: Gate A / DATA_HOLD, spend ≠ Meta, blank dispositions, wrong constraint layer.\n\n' +
      'Not for: changes you already shipped (those are Cadence or Bet). Vacation / LO-out → roster notes.',
    color: '#fbbf24',
    chartDefaultOn: false,
  },
  cadence: {
    label: 'Cadence',
    hint: 'Seat hygiene — expected work, not a KPI experiment.',
    tooltip:
      'Use for permission-level seat work you are not measuring as a KPI bet.\n\n' +
      'Examples: pause/kill clear losers, budget pacing, launch checks, chase blank dispositions, observe 48h.\n\n' +
      'Not for: new campaign / angle / offer / landing test, or any lever you will argue about on Thursday → Bet.',
    color: '#94a3b8',
    chartDefaultOn: false,
  },
  bet: {
    label: 'Bet',
    hint: 'Hypothesized KPI mover — measured live → review.',
    tooltip:
      'Use for one quality lever with a hypothesis and success metric.\n\n' +
      'Examples: new creative/angle/offer, landing/opt-in test, script or Show Rate process change meant to move the grade.\n\n' +
      'Not for: DATA_HOLD fixes, disposition cleanup, or routine prune with no learn goal.\n\n' +
      'Unsure Cadence vs Bet? If you will ask “did it work?” on Thursday → Bet.',
    color: '#60a5fa',
    chartDefaultOn: true,
  },
};

/** Curated bet action categories (what kind of lever). */
export const BET_CATEGORIES = [
  { id: 'new_creatives', label: 'New creatives', group: 'Media' },
  { id: 'new_angle_offer', label: 'New angle / offer', group: 'Media' },
  { id: 'audience_targeting', label: 'Audience / targeting', group: 'Media' },
  { id: 'landing_optin', label: 'Landing / opt-in', group: 'Media' },
  { id: 'budget_allocation', label: 'Budget allocation', group: 'Media' },
  { id: 'campaign_structure', label: 'Campaign structure', group: 'Media' },
  { id: 'reactivate_leads', label: 'Reactivate leads', group: 'CS / Call center' },
  { id: 'confirmation_rebook', label: 'Confirmations / rebook', group: 'Call center' },
  { id: 'dial_coverage', label: 'Dial coverage', group: 'Call center' },
  { id: 'script_booking', label: 'Script / booking flow', group: 'Call center' },
  { id: 'live_transfer', label: 'Live transfer path', group: 'Call center' },
  { id: 'lo_show_process', label: 'LO / show process', group: 'CS' },
  { id: 'other', label: 'Other', group: 'Any' },
] as const;

export type BetCategoryId = (typeof BET_CATEGORIES)[number]['id'];

const BET_CATEGORY_IDS = new Set<string>(BET_CATEGORIES.map(c => c.id));

export function isBetCategoryId(v: unknown): v is BetCategoryId {
  return typeof v === 'string' && BET_CATEGORY_IDS.has(v);
}

export function parseBetCategory(v: unknown): BetCategoryId | null {
  return isBetCategoryId(v) ? v : null;
}

export function betCategoryLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return BET_CATEGORIES.find(c => c.id === id)?.label ?? id;
}

/** Accept loom.com share/share URLs only. */
export function normalizeLoomUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withScheme);
    if (!/(^|\.)loom\.com$/i.test(u.hostname)) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

export function isValidLoomUrl(raw: unknown): boolean {
  return normalizeLoomUrl(raw) != null;
}

/** Live bets need Loom evidence; planned bets may omit it. */
export function betRequiresLoom(changeDate: string | null | undefined): boolean {
  return Boolean(changeDate && String(changeDate).trim());
}

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

/**
 * Read-only CCM Day Playbook — sourced from CCM Daily OS.
 * Not interactive; display + time-aware highlight only.
 */

export type PlaybookBlockId =
  | 'training'
  | 'core'
  | 'kpi_reds'
  | 'ops_planning'
  | 'exec_qa'
  | 'shutdown';

export type PlaybookBlock = {
  id: PlaybookBlockId;
  label: string;
  detail: string;
  /** 0 = Sun … 6 = Sat; null = every weekday */
  weekdays: number[] | null;
};

export const CCM_DAY_BLOCKS: PlaybookBlock[] = [
  {
    id: 'training',
    label: 'Daily training (15–20 min)',
    detail: 'Numbers → one coaching focus → today’s dial targets / which accounts',
    weekdays: null,
  },
  {
    id: 'core',
    label: 'Core day',
    detail:
      'Keep reps on time + dialing + on pace · floor coaching + QA · unblock stack bugs · schedule under-KPI accounts',
    weekdays: null,
  },
  {
    id: 'kpi_reds',
    label: 'Mon / Thu KPI check',
    detail: 'Booking/Show/dial reds + named commitment for Laura',
    weekdays: [1, 4],
  },
  {
    id: 'ops_planning',
    label: 'Mon Ops Planning (as needed)',
    detail: 'Capacity or system design needs CEO',
    weekdays: [1],
  },
  {
    id: 'exec_qa',
    label: 'Fri Exec Q&A',
    detail: 'Pre-submit questions only',
    weekdays: [5],
  },
  {
    id: 'shutdown',
    label: 'Shutdown (10 min)',
    detail: 'Setter EOD · scoreboard · open bugs logged with ETA (or escalated)',
    weekdays: null,
  },
];

export const CCM_PRIORITY_STACK: string[] = [
  'Live booking blockers — AI bot / Hot Prospector / GHL / dialer / reps can’t book',
  'Live setter fires — late / missing / idle / wrong account / stuck leads / no-shows protocol',
  'Daily training + KPI coaching — never skip',
  'Dial + goal pace — mid-day check; correct before EOD',
  'Under-KPI account dial focus — schedule reps onto logos that need it',
  'Floor coaching / QA — quality, not only dial count',
  'Conversion systems — drip/script updates when 1–6 are stable',
  'Recruitment support — when leadership asks; after the floor is stable',
  'Report reds to Laura — before/at KPI with a named next action',
];

/** America/Sao_Paulo-ish floor hours for Rio CCM (approx). */
const FLOOR_START_HOUR = 9;
const FLOOR_END_HOUR = 18;
const TRAINING_END_HOUR = 10;
const SHUTDOWN_START_HOUR = 17;

export type DayContext = {
  weekday: number;
  hour: number;
  /** Fraction of core floor day elapsed (0–1), null outside floor hours */
  day_elapsed_pct: number | null;
  is_reds_day: boolean;
  active_block_id: PlaybookBlockId;
  blocks: PlaybookBlock[];
  priorities: string[];
};

export function buildDayContext(now = new Date()): DayContext {
  const weekday = now.getDay();
  const hour = now.getHours() + now.getMinutes() / 60;
  const is_reds_day = weekday === 1 || weekday === 4;

  let active_block_id: PlaybookBlockId = 'core';
  if (weekday === 0 || weekday === 6) {
    active_block_id = 'core';
  } else if (hour < TRAINING_END_HOUR) {
    active_block_id = 'training';
  } else if (hour >= SHUTDOWN_START_HOUR) {
    active_block_id = 'shutdown';
  } else if (is_reds_day && hour >= 15 && hour < SHUTDOWN_START_HOUR) {
    active_block_id = 'kpi_reds';
  } else if (weekday === 5 && hour >= 14 && hour < SHUTDOWN_START_HOUR) {
    active_block_id = 'exec_qa';
  } else {
    active_block_id = 'core';
  }

  let day_elapsed_pct: number | null = null;
  if (hour >= FLOOR_START_HOUR && hour <= FLOOR_END_HOUR) {
    day_elapsed_pct = Math.min(
      1,
      Math.max(0, (hour - FLOOR_START_HOUR) / (FLOOR_END_HOUR - FLOOR_START_HOUR)),
    );
  } else if (hour > FLOOR_END_HOUR) {
    day_elapsed_pct = 1;
  } else {
    day_elapsed_pct = 0;
  }

  const blocks = CCM_DAY_BLOCKS.filter(
    b => b.weekdays == null || b.weekdays.includes(weekday),
  );

  return {
    weekday,
    hour,
    day_elapsed_pct,
    is_reds_day,
    active_block_id,
    blocks,
    priorities: CCM_PRIORITY_STACK,
  };
}

/**
 * Read-only Media Buyer Day Playbook — sourced from Media Buyer Daily OS (Christian).
 * Not interactive; display + weekday-aware highlight only.
 */

export type MbPlaybookBlockId =
  | 'triage'
  | 'buy_core'
  | 'tech_block'
  | 'kpi_reds'
  | 'ops_planning'
  | 'exec_qa'
  | 'shutdown';

export type MbPlaybookBlock = {
  id: MbPlaybookBlockId;
  label: string;
  detail: string;
  /** 0 = Sun … 6 = Sat; null = every weekday */
  weekdays: number[] | null;
};

export const MB_DAY_BLOCKS: MbPlaybookBlock[] = [
  {
    id: 'triage',
    label: 'Start triage (15 min)',
    detail: 'Any P0? Else account pulse — delivery, spend, CPL / CPQL / Opt-in %',
    weekdays: null,
  },
  {
    id: 'buy_core',
    label: 'Buy-default core',
    detail: 'Optimize / launch / pause · document what changed',
    weekdays: null,
  },
  {
    id: 'tech_block',
    label: 'Tue / Wed AM tech',
    detail: "Laura’s onboard/bug queue only · checklist top to bottom · self-cert before handoff",
    weekdays: [2, 3],
  },
  {
    id: 'kpi_reds',
    label: 'Mon / Thu KPI check',
    detail: 'Reds + named commitment for Laura (CPL / CPQL / Opt-in %)',
    weekdays: [1, 4],
  },
  {
    id: 'ops_planning',
    label: 'Mon Ops Planning',
    detail: 'Your reds + OB tech timeline',
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
    label: 'End of day (10 min)',
    detail: "Tomorrow’s priorities · anything Laura must tell a client · submit EOD",
    weekdays: null,
  },
];

export const MB_BUY_PRIORITY_STACK: string[] = [
  'P0 interrupts — same-day launch / broken delivery / pixel-account broken',
  'Accounts missing CPL / CPQL / Opt-in % targets',
  'Planned tests / optimizations',
  'Notes for Laura on reds before Mon/Thu KPI',
];

export const MB_TECH_PRIORITY_STACK: string[] = [
  'P1 onboard builds (nearest launch date)',
  'Bugs blocking a live client',
  'Checklist cert + handoff to Laura',
  'P2 tech debt only after the above',
];

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 18;
const TRIAGE_END_HOUR = 10;
const TECH_AM_END_HOUR = 13;
const SHUTDOWN_START_HOUR = 17;

export type MbDayContext = {
  weekday: number;
  hour: number;
  /** Fraction of workday elapsed (0–1) */
  day_elapsed_pct: number | null;
  is_reds_day: boolean;
  is_tech_block_day: boolean;
  mode: 'buy' | 'tech';
  active_block_id: MbPlaybookBlockId;
  blocks: MbPlaybookBlock[];
  priorities: string[];
};

export function buildMbDayContext(now = new Date()): MbDayContext {
  const weekday = now.getDay();
  const hour = now.getHours() + now.getMinutes() / 60;
  const is_reds_day = weekday === 1 || weekday === 4;
  const is_tech_block_day = weekday === 2 || weekday === 3;
  const in_tech_am = is_tech_block_day && hour < TECH_AM_END_HOUR;
  const mode: 'buy' | 'tech' = in_tech_am ? 'tech' : 'buy';

  let active_block_id: MbPlaybookBlockId = 'buy_core';
  if (weekday === 0 || weekday === 6) {
    active_block_id = 'buy_core';
  } else if (hour < TRIAGE_END_HOUR) {
    active_block_id = 'triage';
  } else if (hour >= SHUTDOWN_START_HOUR) {
    active_block_id = 'shutdown';
  } else if (in_tech_am) {
    active_block_id = 'tech_block';
  } else if (is_reds_day && hour >= 15 && hour < SHUTDOWN_START_HOUR) {
    active_block_id = 'kpi_reds';
  } else if (weekday === 5 && hour >= 14 && hour < SHUTDOWN_START_HOUR) {
    active_block_id = 'exec_qa';
  } else if (weekday === 1 && hour >= 11 && hour < 13) {
    active_block_id = 'ops_planning';
  } else {
    active_block_id = 'buy_core';
  }

  let day_elapsed_pct: number | null = null;
  if (hour >= DAY_START_HOUR && hour <= DAY_END_HOUR) {
    day_elapsed_pct = Math.min(
      1,
      Math.max(0, (hour - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)),
    );
  } else if (hour > DAY_END_HOUR) {
    day_elapsed_pct = 1;
  } else {
    day_elapsed_pct = 0;
  }

  const blocks = MB_DAY_BLOCKS.filter(
    b => b.weekdays == null || b.weekdays.includes(weekday),
  );

  return {
    weekday,
    hour,
    day_elapsed_pct,
    is_reds_day,
    is_tech_block_day,
    mode,
    active_block_id,
    blocks,
    priorities: mode === 'tech' ? MB_TECH_PRIORITY_STACK : MB_BUY_PRIORITY_STACK,
  };
}

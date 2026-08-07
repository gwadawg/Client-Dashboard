/**
 * Read-only Client Success (Laura) Day Playbook — sourced from Client Success Daily OS.
 * Not interactive; display + weekday-aware highlight only.
 */

export type CsPlaybookBlockId =
  | 'triage'
  | 'calls'
  | 'health'
  | 'kpi_reds'
  | 'ops_planning'
  | 'exec_qa'
  | 'shutdown';

export type CsPlaybookBlock = {
  id: CsPlaybookBlockId;
  label: string;
  detail: string;
  /** 0 = Sun … 6 = Sat; null = every weekday */
  weekdays: number[] | null;
};

export const CS_DAY_BLOCKS: CsPlaybookBlock[] = [
  {
    id: 'triage',
    label: 'Start of day (15–20 min)',
    detail:
      'Calendar + client Slack/email triage · flag anything for Christian (tech) or Pedro (floor)',
    weekdays: null,
  },
  {
    id: 'calls',
    label: 'Live client calls',
    detail: 'Check-ins / updates / OB-launch (only after Christian’s checklist is certified)',
    weekdays: null,
  },
  {
    id: 'health',
    label: 'Midday account scan',
    detail:
      'Red / yellow / green · chase open KPI commitments · help Pedro only if stuck on a stack bug',
    weekdays: null,
  },
  {
    id: 'kpi_reds',
    label: 'Mon / Thu KPI check',
    detail:
      'Bring rollup · leave with named commitments + due dates from Christian / Pedro',
    weekdays: [1, 4],
  },
  {
    id: 'ops_planning',
    label: 'Mon Ops Planning',
    detail: 'OB board + system gaps with CEO',
    weekdays: [1],
  },
  {
    id: 'exec_qa',
    label: 'Fri Exec Q&A',
    detail: 'Pre-submitted questions only',
    weekdays: [5],
  },
  {
    id: 'shutdown',
    label: 'End of day (10 min)',
    detail:
      'Update rollup · confirm tomorrow’s calls · no open “who owns this?” · submit EOD',
    weekdays: null,
  },
];

export const CS_PRIORITY_STACK: string[] = [
  'Live client calls — check-ins, updates, OB/launch (checklist certified)',
  'Payroll / time-sensitive people ops — pay cycle, urgent coverage',
  'Light launch gate — Christian self-cert before scheduling / running launch',
  'Red accounts — named commitment + due date from Christian and/or Pedro; follow up',
  'Queue hygiene — setup/OB breaks land on Christian’s Tue/Wed tech blocks',
  'Proactive check-ins — healthy accounts on cadence, not only fires',
  'High-level team management — PTO, hiring logistics, escalate performance to CEO',
  'Stack-bug help (after Pedro) — then Christian if still stuck',
  'Admin / notes — CRM + handoff so nothing lives only in your head',
];

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 18;
const TRIAGE_END_HOUR = 10;
const SHUTDOWN_START_HOUR = 17;

export type CsDayContext = {
  weekday: number;
  hour: number;
  day_elapsed_pct: number | null;
  is_reds_day: boolean;
  active_block_id: CsPlaybookBlockId;
  blocks: CsPlaybookBlock[];
  priorities: string[];
};

export function buildCsDayContext(now = new Date()): CsDayContext {
  const weekday = now.getDay();
  const hour = now.getHours() + now.getMinutes() / 60;
  const is_reds_day = weekday === 1 || weekday === 4;

  let active_block_id: CsPlaybookBlockId = 'calls';
  if (weekday === 0 || weekday === 6) {
    active_block_id = 'calls';
  } else if (hour < TRIAGE_END_HOUR) {
    active_block_id = 'triage';
  } else if (hour >= SHUTDOWN_START_HOUR) {
    active_block_id = 'shutdown';
  } else if (is_reds_day && hour >= 10 && hour < 12) {
    active_block_id = 'kpi_reds';
  } else if (weekday === 1 && hour >= 14 && hour < SHUTDOWN_START_HOUR) {
    active_block_id = 'ops_planning';
  } else if (weekday === 5 && hour >= 14 && hour < SHUTDOWN_START_HOUR) {
    active_block_id = 'exec_qa';
  } else if (hour >= 12 && hour < 15) {
    active_block_id = 'health';
  } else {
    active_block_id = 'calls';
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

  const blocks = CS_DAY_BLOCKS.filter(
    b => b.weekdays === null || b.weekdays.includes(weekday),
  );

  return {
    weekday,
    hour,
    day_elapsed_pct,
    is_reds_day,
    active_block_id,
    blocks,
    priorities: CS_PRIORITY_STACK,
  };
}

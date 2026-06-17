import { buildContactKey, eventPhone } from "@/lib/contact-key";
import { CALL_CENTER_TIMEZONE, getZonedParts } from "@/lib/time";

// Speed-to-lead, computed honestly:
//   - pair each lead to its first dial (per client + contact),
//   - require a REAL timestamp on both (date-only leads have no time of day),
//   - count a lead only if it arrived inside a live setter-availability window,
//   - summarize with the MEDIAN (response time is heavily right-skewed; a mean is
//     wrecked by overnight/off-hours outliers).

export type SpeedToLeadEventRow = {
  event_type: string;
  client_id: string | null;
  ghl_contact_id: string | null;
  lead_phone: string | null;
  phone_number_used?: string | null;
  agent_name?: string | null;
  lead_name?: string | null;
  occurred_at: string;
  occurred_at_has_time: boolean | null;
  /** On dial rows: the lead's real creation time captured from the dialer payload. */
  lead_created_at?: string | null;
  is_pickup?: boolean | null;
  is_conversation?: boolean | null;
};

export type AvailabilityWindow = {
  weekday: string;
  time_start: string;
  time_end: string;
  is_live: boolean;
};

export type SpeedToLeadOptions = {
  /** Minutes since midnight in timeZone; lead must arrive at or after this time. */
  leadAfterMin?: number | null;
  /** Minutes since midnight in timeZone; lead must arrive before this time. */
  leadBeforeMin?: number | null;
  /** When true, skip setter_availability window check (manual filter only). */
  ignoreAvailability?: boolean;
};

export type SpeedToLeadExclusionReason =
  | "no_time"
  | "off_hours"
  | "before_cutoff"
  | "after_cutoff";

export type SpeedToLeadReading = {
  contact_key: string;
  client_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_at: string;
  dial_at: string;
  seconds: number;
  agent: string | null;
  lead_hour: number;
  lead_weekday: number;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
  /** True when this reading contributed to the median / by_hour buckets. */
  counted: boolean;
  excluded_reason?: SpeedToLeadExclusionReason;
};

export type SpeedToLeadHourBucket = {
  median_min: number | null;
  sample_size: number;
};

export type SpeedToLeadResult = {
  /** Median minutes from lead to first dial across in-window leads, or null if none. */
  median_min: number | null;
  /** Number of leads that contributed to the median. */
  sample_size: number;
  /** Leads with a first dial but that arrived outside any live availability window. */
  excluded_out_of_window: number;
  /** Leads/dials skipped because a precise timestamp was missing (date-only source). */
  excluded_no_time: number;
  /** Leads excluded because lead arrival was before leadAfterMin. */
  excluded_before_cutoff: number;
  /** Leads excluded because lead arrival was at or after leadBeforeMin. */
  excluded_after_cutoff: number;
  /** Per-agent median/sample, keyed by resolved agent name (whoever made the first dial). */
  by_agent: Record<string, { median_min: number | null; sample_size: number }>;
  /** Median minutes by lead-arrival hour (0–23) in timeZone. */
  by_hour: Record<number, SpeedToLeadHourBucket>;
  /** All paired lead→first-dial rows with inclusion/exclusion metadata. */
  readings: SpeedToLeadReading[];
  /** IANA zone used for window and cutoff evaluation. */
  time_zone: string;
  /** Count of live setter_availability windows configured. */
  live_window_count: number;
};

const WEEKDAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** "HH:MM" or "HH:MM:SS" → minutes since midnight, or null if unparseable. */
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(minutes) ? minutes : null;
}

type Window = { start: number; end: number };

function buildAvailabilityMap(rows: AvailabilityWindow[]): Map<number, Window[]> {
  const map = new Map<number, Window[]>();
  for (const row of rows) {
    if (!row.is_live) continue;
    const weekday = WEEKDAY_NAME_TO_NUM[row.weekday?.trim().toLowerCase()];
    if (weekday === undefined) continue;
    const start = parseTimeToMinutes(row.time_start);
    const end = parseTimeToMinutes(row.time_end);
    if (start === null || end === null || end <= start) continue;
    const list = map.get(weekday) ?? [];
    list.push({ start, end });
    map.set(weekday, list);
  }
  return map;
}

function countLiveWindows(rows: AvailabilityWindow[]): number {
  let n = 0;
  for (const row of rows) {
    if (!row.is_live) continue;
    const weekday = WEEKDAY_NAME_TO_NUM[row.weekday?.trim().toLowerCase()];
    if (weekday === undefined) continue;
    const start = parseTimeToMinutes(row.time_start);
    const end = parseTimeToMinutes(row.time_end);
    if (start === null || end === null || end <= start) continue;
    n++;
  }
  return n;
}

function isInWindow(map: Map<number, Window[]>, weekday: number, minutesOfDay: number): boolean {
  const windows = map.get(weekday);
  if (!windows) return false;
  return windows.some(w => minutesOfDay >= w.start && minutesOfDay < w.end);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function contactKey(row: SpeedToLeadEventRow): string | null {
  if (!row.client_id) return null;
  return buildContactKey(row.client_id, eventPhone(row), row.ghl_contact_id);
}

/** Earliest live window start (minutes since midnight) for a weekday, or null if none. */
export function deriveDefaultLeadAfter(
  availability: AvailabilityWindow[],
  weekday: number,
): number | null {
  let earliest: number | null = null;
  for (const row of availability) {
    if (!row.is_live) continue;
    const w = WEEKDAY_NAME_TO_NUM[row.weekday?.trim().toLowerCase()];
    if (w !== weekday) continue;
    const start = parseTimeToMinutes(row.time_start);
    if (start === null) continue;
    if (earliest === null || start < earliest) earliest = start;
  }
  return earliest;
}

/**
 * @param events       Lead + dial events for the period/client(s) under analysis.
 * @param availability Setter availability rows (only `is_live` windows are used).
 * @param timeZone     Zone the availability hours are expressed in.
 * @param resolveAgent Optional mapper to normalize the first dial's agent_name for the
 *                     per-agent breakdown (e.g. roster matcher).
 * @param options      Optional manual time cutoffs and availability override.
 *
 * If no live availability windows are configured, the window filter is skipped
 * (every precise lead counts) so the metric still works before a schedule exists.
 */
export function computeSpeedToLead(
  events: SpeedToLeadEventRow[],
  availability: AvailabilityWindow[],
  timeZone: string = CALL_CENTER_TIMEZONE,
  resolveAgent?: (raw: string | null | undefined) => string | null,
  options: SpeedToLeadOptions = {},
): SpeedToLeadResult {
  const windowMap = buildAvailabilityMap(availability);
  const hasWindows = windowMap.size > 0;
  const applyAvailability = hasWindows && !options.ignoreAvailability;
  const leadAfterMin = options.leadAfterMin ?? null;
  const leadBeforeMin = options.leadBeforeMin ?? null;

  const earliestLead = new Map<string, SpeedToLeadEventRow>();
  const earliestDial = new Map<string, SpeedToLeadEventRow>();

  for (const row of events) {
    const key = contactKey(row);
    if (!key) continue;
    if (row.event_type === "lead") {
      const cur = earliestLead.get(key);
      if (!cur || row.occurred_at < cur.occurred_at) earliestLead.set(key, row);
    } else if (row.event_type === "dial") {
      const cur = earliestDial.get(key);
      if (!cur || row.occurred_at < cur.occurred_at) earliestDial.set(key, row);
    }
  }

  const includedSeconds: number[] = [];
  const byAgentReadings = new Map<string, number[]>();
  const byHourReadings = new Map<number, number[]>();
  const allReadings: SpeedToLeadReading[] = [];
  let excludedOutOfWindow = 0;
  let excludedNoTime = 0;
  let excludedBeforeCutoff = 0;
  let excludedAfterCutoff = 0;

  for (const [key, dial] of earliestDial) {
    let leadIso: string | null = null;
    let leadPrecise = false;
    let leadRow: SpeedToLeadEventRow | undefined;
    if (dial.lead_created_at) {
      leadIso = dial.lead_created_at;
      leadPrecise = true;
    } else {
      leadRow = earliestLead.get(key);
      if (leadRow) {
        leadIso = leadRow.occurred_at;
        leadPrecise = leadRow.occurred_at_has_time !== false;
      }
    }
    if (!leadIso) continue;

    const leadMs = new Date(leadIso).getTime();
    const dialMs = new Date(dial.occurred_at).getTime();
    if (!(dialMs > leadMs)) continue;

    const seconds = (dialMs - leadMs) / 1000;
    const agent = (resolveAgent ? resolveAgent(dial.agent_name) : null) ?? dial.agent_name?.trim() ?? null;
    const parts = getZonedParts(leadIso, timeZone);
    const leadHour = parts ? Math.floor(parts.minutesOfDay / 60) : 0;
    const leadWeekday = parts?.weekday ?? 0;

    const base: Omit<SpeedToLeadReading, "counted" | "excluded_reason"> = {
      contact_key: key,
      client_id: dial.client_id,
      lead_name: dial.lead_name ?? leadRow?.lead_name ?? null,
      lead_phone: dial.lead_phone ?? leadRow?.lead_phone ?? null,
      lead_at: leadIso,
      dial_at: dial.occurred_at,
      seconds,
      agent,
      lead_hour: leadHour,
      lead_weekday: leadWeekday,
      is_pickup: dial.is_pickup ?? null,
      is_conversation: dial.is_conversation ?? null,
    };

    if (!leadPrecise || dial.occurred_at_has_time === false) {
      excludedNoTime++;
      allReadings.push({ ...base, counted: false, excluded_reason: "no_time" });
      continue;
    }

    if (applyAvailability) {
      if (!parts || !isInWindow(windowMap, parts.weekday, parts.minutesOfDay)) {
        excludedOutOfWindow++;
        allReadings.push({ ...base, counted: false, excluded_reason: "off_hours" });
        continue;
      }
    }

    if (leadAfterMin !== null && parts && parts.minutesOfDay < leadAfterMin) {
      excludedBeforeCutoff++;
      allReadings.push({ ...base, counted: false, excluded_reason: "before_cutoff" });
      continue;
    }

    if (leadBeforeMin !== null && parts && parts.minutesOfDay >= leadBeforeMin) {
      excludedAfterCutoff++;
      allReadings.push({ ...base, counted: false, excluded_reason: "after_cutoff" });
      continue;
    }

    includedSeconds.push(seconds);
    allReadings.push({ ...base, counted: true });

    if (agent) {
      const list = byAgentReadings.get(agent) ?? [];
      list.push(seconds);
      byAgentReadings.set(agent, list);
    }

    const hourList = byHourReadings.get(leadHour) ?? [];
    hourList.push(seconds);
    byHourReadings.set(leadHour, hourList);
  }

  const by_agent: Record<string, { median_min: number | null; sample_size: number }> = {};
  for (const [agentName, list] of byAgentReadings) {
    const m = median(list);
    by_agent[agentName] = {
      median_min: m === null ? null : Math.round((m / 60) * 10) / 10,
      sample_size: list.length,
    };
  }

  const by_hour: Record<number, SpeedToLeadHourBucket> = {};
  for (const [hour, list] of byHourReadings) {
    const m = median(list);
    by_hour[hour] = {
      median_min: m === null ? null : Math.round((m / 60) * 10) / 10,
      sample_size: list.length,
    };
  }

  const med = median(includedSeconds);
  return {
    median_min: med === null ? null : Math.round((med / 60) * 10) / 10,
    sample_size: includedSeconds.length,
    excluded_out_of_window: excludedOutOfWindow,
    excluded_no_time: excludedNoTime,
    excluded_before_cutoff: excludedBeforeCutoff,
    excluded_after_cutoff: excludedAfterCutoff,
    by_agent,
    by_hour,
    readings: allReadings,
    time_zone: timeZone,
    live_window_count: countLiveWindows(availability),
  };
}

/** Parse `lead_after` / `lead_before` (HH:MM) and setter-schedule toggle from query params. */
export function parseSpeedToLeadParams(searchParams: URLSearchParams): SpeedToLeadOptions {
  const leadAfterMin = parseTimeToMinutes(searchParams.get("lead_after"));
  const leadBeforeMin = parseTimeToMinutes(searchParams.get("lead_before"));
  const useSetterSchedule = searchParams.get("use_setter_schedule") !== "false";
  return {
    leadAfterMin,
    leadBeforeMin,
    ignoreAvailability: !useSetterSchedule,
  };
}

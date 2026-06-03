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
  occurred_at: string;
  occurred_at_has_time: boolean | null;
  /** On dial rows: the lead's real creation time captured from the dialer payload. */
  lead_created_at?: string | null;
};

export type AvailabilityWindow = {
  weekday: string;
  time_start: string;
  time_end: string;
  is_live: boolean;
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
  /** Per-agent median/sample, keyed by resolved agent name (whoever made the first dial). */
  by_agent: Record<string, { median_min: number | null; sample_size: number }>;
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
function timeToMinutes(value: string | null | undefined): number | null {
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
    const start = timeToMinutes(row.time_start);
    const end = timeToMinutes(row.time_end);
    if (start === null || end === null || end <= start) continue;
    const list = map.get(weekday) ?? [];
    list.push({ start, end });
    map.set(weekday, list);
  }
  return map;
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

/**
 * @param events       Lead + dial events for the period/client(s) under analysis.
 * @param availability Setter availability rows (only `is_live` windows are used).
 * @param timeZone     Zone the availability hours are expressed in.
 *
 * If no live availability windows are configured, the window filter is skipped
 * (every precise lead counts) so the metric still works before a schedule exists.
 *
 * @param resolveAgent Optional mapper to normalize the first dial's agent_name for the
 *                     per-agent breakdown (e.g. roster matcher).
 */
export function computeSpeedToLead(
  events: SpeedToLeadEventRow[],
  availability: AvailabilityWindow[],
  timeZone: string = CALL_CENTER_TIMEZONE,
  resolveAgent?: (raw: string | null | undefined) => string | null,
): SpeedToLeadResult {
  const windowMap = buildAvailabilityMap(availability);
  const hasWindows = windowMap.size > 0;

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

  const readings: number[] = [];
  const byAgentReadings = new Map<string, number[]>();
  let excludedOutOfWindow = 0;
  let excludedNoTime = 0;

  // Iterate by first dial — speed-to-lead only exists when a lead was dialed. The lead instant
  // is the dial's captured lead_created_at when present (precise), else the paired lead event.
  for (const [key, dial] of earliestDial) {
    let leadIso: string | null = null;
    let leadPrecise = false;
    if (dial.lead_created_at) {
      leadIso = dial.lead_created_at;
      leadPrecise = true;
    } else {
      const lead = earliestLead.get(key);
      if (lead) {
        leadIso = lead.occurred_at;
        leadPrecise = lead.occurred_at_has_time !== false;
      }
    }
    if (!leadIso) continue; // no lead reference for this dial

    const leadMs = new Date(leadIso).getTime();
    const dialMs = new Date(dial.occurred_at).getTime();
    if (!(dialMs > leadMs)) continue; // dial before lead → ignore (data quirk)

    if (!leadPrecise || dial.occurred_at_has_time === false) {
      excludedNoTime++;
      continue;
    }

    if (hasWindows) {
      const parts = getZonedParts(leadIso, timeZone);
      if (!parts || !isInWindow(windowMap, parts.weekday, parts.minutesOfDay)) {
        excludedOutOfWindow++;
        continue;
      }
    }

    const seconds = (dialMs - leadMs) / 1000;
    readings.push(seconds);

    const agent = (resolveAgent ? resolveAgent(dial.agent_name) : null) ?? dial.agent_name?.trim();
    if (agent) {
      const list = byAgentReadings.get(agent) ?? [];
      list.push(seconds);
      byAgentReadings.set(agent, list);
    }
  }

  const by_agent: Record<string, { median_min: number | null; sample_size: number }> = {};
  for (const [agent, list] of byAgentReadings) {
    const m = median(list);
    by_agent[agent] = {
      median_min: m === null ? null : Math.round((m / 60) * 10) / 10,
      sample_size: list.length,
    };
  }

  const med = median(readings);
  return {
    median_min: med === null ? null : Math.round((med / 60) * 10) / 10,
    sample_size: readings.length,
    excluded_out_of_window: excludedOutOfWindow,
    excluded_no_time: excludedNoTime,
    by_agent,
  };
}

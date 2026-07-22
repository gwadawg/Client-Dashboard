// Timezone-aware timestamp handling for event ingest + schedule math.
//
// The dashboard stores every event at `occurred_at` (timestamptz / UTC). Accuracy of
// time-sensitive KPIs (speed-to-lead in particular) depends entirely on turning the
// many timestamp shapes upstream sources send into a correct UTC instant:
//   - ISO with offset/Z (e.g. 2026-06-03T08:14:22-04:00) — authoritative, trust it.
//   - ISO without offset (e.g. 2026-06-03T20:18:12)       — naive wall-clock, must be
//                                                            anchored to a real timezone.
//   - date only (e.g. 2026-06-03)                         — no time of day at all.
//
// No external dependency: zone math is done with Intl.DateTimeFormat.

/**
 * Timezone the setter team's shift hours are expressed in. Used to decide whether a lead
 * arrived "in window" (and as a last-resort anchor for offset-less non-dial timestamps).
 */
export const CALL_CENTER_TIMEZONE = process.env.CALL_CENTER_TIMEZONE || "America/Sao_Paulo";

/**
 * Timezone that Make / the dialer renders timestamps in when they arrive WITHOUT an offset
 * (e.g. "2026-06-03T20:18:12"). Both lead and dial times flow through the same Make org, so a
 * naive timestamp is in this zone — NOT the agents' zone and NOT the client's zone. Anchoring
 * lead and dial alike to one source zone keeps the lead→dial duration internally consistent.
 *
 * The best fix upstream is to send timestamps WITH their offset/Z (then this never applies).
 */
export const INGEST_SOURCE_TIMEZONE =
  process.env.INGEST_SOURCE_TIMEZONE || process.env.DIAL_SOURCE_TIMEZONE || "America/New_York";

/**
 * Fallback zone for displaying an event in the lead's LOCAL time of day (heat maps) when the
 * lead's own `lead_timezone` is unknown — historical rows, or payloads missing GHL's `timezone`.
 */
export const DEFAULT_DISPLAY_TIMEZONE =
  process.env.LEAD_DEFAULT_TIMEZONE || "America/New_York";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_NO_OFFSET = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * True if `tz` is an IANA zone the runtime accepts (e.g. "America/New_York"). Upstream payloads
 * may carry a per-contact `timezone`; validate before trusting it as an anchor.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * North-American timezone abbreviations → DST-aware IANA zones. Sources like HP (and GHL's
 * `clients.timezone`) emit "est" / "PST" rather than "America/New_York". These must be mapped:
 * "PST"/"CST" aren't valid zones at all, and literal "EST" is fixed UTC-5 (no daylight saving),
 * which is an hour wrong whenever the region is on EDT. We map to the canonical DST zone.
 */
const TZ_ABBREVIATIONS: Record<string, string> = {
  est: "America/New_York", edt: "America/New_York", et: "America/New_York", eastern: "America/New_York",
  cst: "America/Chicago", cdt: "America/Chicago", ct: "America/Chicago", central: "America/Chicago",
  mst: "America/Denver", mdt: "America/Denver", mt: "America/Denver", mountain: "America/Denver",
  pst: "America/Los_Angeles", pdt: "America/Los_Angeles", pt: "America/Los_Angeles", pacific: "America/Los_Angeles",
  akst: "America/Anchorage", akdt: "America/Anchorage", alaska: "America/Anchorage",
  hst: "Pacific/Honolulu", hast: "Pacific/Honolulu", hawaii: "Pacific/Honolulu",
  utc: "UTC", gmt: "UTC", z: "UTC",
};

/**
 * Resolve an upstream timezone value to a usable IANA zone, or null. Handles both proper IANA
 * names ("America/New_York") and common abbreviations ("est", "PST"). Abbreviations are checked
 * first so DST-correct zones win over the fixed-offset "EST"/"MST" tzdb entries.
 */
export function normalizeTimeZone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const mapped = TZ_ABBREVIATIONS[t.toLowerCase()];
  if (mapped) return mapped;
  return isValidTimeZone(t) ? t : null;
}

/**
 * Minutes east of UTC for `timeZone` at the given instant (handles DST).
 * e.g. America/New_York in summer → -240, in winter → -300.
 */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Interpret naive wall-clock components as a time in `timeZone` and return the UTC instant.
 * Refines once so timestamps near a DST transition resolve correctly.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = tzOffsetMinutes(new Date(guess), timeZone);
  const utc1 = guess - offset1 * 60000;
  const offset2 = tzOffsetMinutes(new Date(utc1), timeZone);
  return new Date(guess - offset2 * 60000);
}

export type NormalizedTimestamp = {
  /** UTC ISO string suitable for a timestamptz column, or null if unparseable. */
  iso: string | null;
  /** False when the source only gave a date (no real time of day). */
  hasTime: boolean;
};

/**
 * Normalize an upstream timestamp to a UTC ISO string + whether it carried a real time.
 *
 * @param value     Raw value from the webhook/import.
 * @param fallbackTz IANA zone used only when the value has a time but no offset.
 */
export function normalizeTimestamp(
  value: unknown,
  fallbackTz: string = CALL_CENTER_TIMEZONE,
): NormalizedTimestamp {
  if (value == null) return { iso: null, hasTime: false };
  if (typeof value !== "string") {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { iso: value.toISOString(), hasTime: true };
    }
    return { iso: null, hasTime: false };
  }

  const t = value.trim();
  if (!t) return { iso: null, hasTime: false };

  // Date only — no time of day. Anchor at noon UTC so UTC day-bucketing stays on this date.
  if (DATE_ONLY.test(t)) {
    const ms = Date.parse(`${t}T12:00:00.000Z`);
    return { iso: Number.isNaN(ms) ? null : new Date(ms).toISOString(), hasTime: false };
  }

  // Explicit offset/Z present — authoritative.
  if (HAS_OFFSET.test(t)) {
    const ms = Date.parse(t);
    return { iso: Number.isNaN(ms) ? null : new Date(ms).toISOString(), hasTime: true };
  }

  // ISO datetime without offset — naive wall-clock, anchor to fallback zone.
  const m = ISO_NO_OFFSET.exec(t);
  if (m) {
    const utc = zonedWallTimeToUtc(
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      m[6] ? Number(m[6]) : 0,
      fallbackTz,
    );
    return Number.isNaN(utc.getTime())
      ? { iso: null, hasTime: false }
      : { iso: utc.toISOString(), hasTime: true };
  }

  // Unknown shape — best effort. Treat as carrying a time so existing odd formats still ingest.
  const ms = Date.parse(t);
  return { iso: Number.isNaN(ms) ? null : new Date(ms).toISOString(), hasTime: true };
}

export type ZonedParts = {
  /** 0 = Sunday … 6 = Saturday, in `timeZone`. */
  weekday: number;
  /** Minutes since local midnight in `timeZone` (0–1439). */
  minutesOfDay: number;
};

/** Wall-clock weekday + minute-of-day for a UTC instant, in `timeZone`. */
export function getZonedParts(iso: string, timeZone: string): ZonedParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[map.weekday];
  if (weekday === undefined) return null;
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  return { weekday, minutesOfDay: hour * 60 + Number(map.minute) };
}

/** Hour-of-day (0–23) + weekday (0=Sun … 6=Sat) for a UTC instant, in `timeZone`. */
export function getZonedHourDay(
  iso: string,
  timeZone: string,
): { hour: number; day: number } | null {
  const parts = getZonedParts(iso, timeZone);
  if (!parts) return null;
  return { hour: Math.floor(parts.minutesOfDay / 60), day: parts.weekday };
}

/**
 * Format an instant as YYYY-MM-DD in `timeZone` (en-CA → ISO-like date).
 * Use this instead of `toISOString().split('T')[0]` for floor/ops "today" buckets —
 * UTC calendar day drifts from America/Sao_Paulo after 21:00 local.
 */
export function ymdInTimeZone(
  date: Date,
  timeZone: string = CALL_CENTER_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Local Y-M-D in CALL_CENTER_TIMEZONE for "now". */
export function todayYmdInCallCenterTz(
  now: Date = new Date(),
  timeZone: string = CALL_CENTER_TIMEZONE,
): string {
  return ymdInTimeZone(now, timeZone);
}

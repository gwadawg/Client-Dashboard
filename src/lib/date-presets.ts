export type DatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "ytd"
  | "last_7"
  | "last_14"
  | "last_30"
  | "last_90"
  | "all_time"
  | "custom";

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  last_quarter: "Last Quarter",
  ytd: "Year to Date",
  last_7: "Last 7 Days",
  last_14: "Last 14 Days",
  last_30: "Last 30 Days",
  last_90: "Last 90 Days",
  all_time: "All Time",
  custom: "Custom Range",
};

/** Display order for preset menus — quarterly grouped with monthly. */
export const PRESET_ORDER: DatePreset[] = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "ytd",
  "last_7",
  "last_14",
  "last_30",
  "last_90",
  "all_time",
  "custom",
];

export const ALL_TIME_START = "2000-01-01";

/** Format a Date as YYYY-MM-DD using local calendar fields. */
export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getDateRange(p: DatePreset): { start: string; end: string } {
  const now = new Date();
  const today = ymdLocal(now);
  if (p === "today") return { start: today, end: today };
  if (p === "yesterday") {
    const y = ymdLocal(new Date(now.getTime() - 86400000));
    return { start: y, end: y };
  }
  if (p === "this_week") {
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return { start: ymdLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)), end: today };
  }
  if (p === "last_week") {
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const thisMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
    const lastMon = new Date(thisMon.getTime() - 7 * 86400000);
    const lastSun = new Date(thisMon.getTime() - 86400000);
    return { start: ymdLocal(lastMon), end: ymdLocal(lastSun) };
  }
  if (p === "this_month") {
    return { start: ymdLocal(new Date(now.getFullYear(), now.getMonth(), 1)), end: today };
  }
  if (p === "last_month") {
    return {
      start: ymdLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: ymdLocal(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (p === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: ymdLocal(new Date(now.getFullYear(), q * 3, 1)), end: today };
  }
  if (p === "last_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const lastQStartMonth = ((q - 1 + 4) % 4) * 3;
    const year = q === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return {
      start: ymdLocal(new Date(year, lastQStartMonth, 1)),
      end: ymdLocal(new Date(year, lastQStartMonth + 3, 0)),
    };
  }
  if (p === "ytd") return { start: ymdLocal(new Date(now.getFullYear(), 0, 1)), end: today };
  if (p === "last_90") return { start: ymdLocal(new Date(now.getTime() - 90 * 86400000)), end: today };
  if (p === "last_30") return { start: ymdLocal(new Date(now.getTime() - 30 * 86400000)), end: today };
  if (p === "last_14") return { start: ymdLocal(new Date(now.getTime() - 14 * 86400000)), end: today };
  if (p === "last_7") return { start: ymdLocal(new Date(now.getTime() - 7 * 86400000)), end: today };
  return { start: ALL_TIME_START, end: today };
}

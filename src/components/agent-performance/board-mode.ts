/** Board focus: period stats from the date filter, vs live call-center today. */
export type FloorBoardMode = "period" | "today";

export function defaultBoardMode(preset: string): FloorBoardMode {
  if (preset === "today" || preset === "yesterday") return "today";
  return "period";
}

/**
 * Monthly conversation goals only make sense when the filter is month-to-date
 * or a closed calendar month (starts on the 1st of the end date's month).
 */
export function periodAlignsWithMonthlyGoals(
  startDate: string,
  endDate: string,
): { aligned: boolean; month: string } {
  const rawEnd = (endDate ?? "").trim();
  const rawStart = (startDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawEnd) || !/^\d{4}-\d{2}-\d{2}$/.test(rawStart)) {
    return { aligned: false, month: "" };
  }
  const month = rawEnd.slice(0, 7);
  const monthStart = `${month}-01`;
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  const aligned = rawStart === monthStart && rawEnd >= monthStart && rawEnd <= monthEnd;
  return { aligned, month };
}

export function formatPeriodLabel(
  preset: string,
  startDate: string,
  endDate: string,
): string {
  const pretty = (preset || "").replace(/_/g, " ");
  if (startDate && endDate && startDate === endDate) {
    return pretty && pretty !== "custom" ? `${titleCase(pretty)} · ${startDate}` : startDate;
  }
  if (startDate && endDate) {
    const range = `${startDate} → ${endDate}`;
    if (pretty && pretty !== "custom" && pretty !== "all time") {
      return `${titleCase(pretty)} · ${range}`;
    }
    return range;
  }
  return pretty ? titleCase(pretty) : "Selected period";
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

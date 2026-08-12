/** Date-only YYYY-MM-DD helpers for client launch / time-live. */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type ClientTenureInput = {
  launch_date?: string | null;
  date_signed?: string | null;
  lifecycle_status?: string | null;
  churned_at?: string | null;
};

export type ClientTenureView = {
  phase: "live" | "prelaunch" | "churned" | "signed" | "unknown";
  launchYmd: string | null;
  launchLabel: string | null;
  signedLabel: string | null;
  liveLabel: string;
  engagementMonth: number | null;
  daysLive: number | null;
  sinceLaunchAvailable: boolean;
};

export function toYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  return YMD.test(day) ? day : null;
}

/** Local-calendar display: Mar 12, 2026. */
export function formatYmdLabel(ymd: string | null | undefined): string | null {
  const day = toYmd(ymd);
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type YmdParts = { y: number; m: number; d: number };

function parseYmdParts(ymd: string): YmdParts | null {
  const day = toYmd(ymd);
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function addMonths(parts: YmdParts, monthsToAdd: number): YmdParts {
  const total = parts.y * 12 + (parts.m - 1) + monthsToAdd;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(parts.d, lastDayOfMonth(y, m)) };
}

function ymdValue(parts: YmdParts): number {
  return parts.y * 10_000 + parts.m * 100 + parts.d;
}

function diffUtcDays(start: YmdParts, end: YmdParts): number {
  return Math.floor(
    (Date.UTC(end.y, end.m - 1, end.d) - Date.UTC(start.y, start.m - 1, start.d)) / 86_400_000,
  );
}

export function calendarDuration(
  startYmd: string,
  endYmd: string,
): { years: number; months: number; days: number; totalDays: number } {
  const start = parseYmdParts(startYmd);
  const end = parseYmdParts(endYmd);
  if (!start || !end) return { years: 0, months: 0, days: 0, totalDays: 0 };

  let months = (end.y - start.y) * 12 + (end.m - start.m);
  let anniversary = addMonths(start, months);
  if (ymdValue(anniversary) > ymdValue(end)) {
    months -= 1;
    anniversary = addMonths(start, months);
  }
  if (months < 0) {
    return { years: 0, months: 0, days: 0, totalDays: diffUtcDays(start, end) };
  }

  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: diffUtcDays(anniversary, end),
    totalDays: diffUtcDays(start, end),
  };
}

export function formatDurationParts(parts: {
  years: number;
  months: number;
  days: number;
}): string {
  const chunks: string[] = [];
  if (parts.years) chunks.push(`${parts.years} year${parts.years === 1 ? "" : "s"}`);
  if (parts.months) chunks.push(`${parts.months} month${parts.months === 1 ? "" : "s"}`);
  if (parts.days || chunks.length === 0) {
    chunks.push(`${parts.days} day${parts.days === 1 ? "" : "s"}`);
  }
  return chunks.join(", ");
}

export function describeClientTenure(
  client: ClientTenureInput,
  todayYmd: string,
): ClientTenureView {
  const today = toYmd(todayYmd) ?? todayYmd.slice(0, 10);
  const launchYmd = toYmd(client.launch_date);
  const signedYmd = toYmd(client.date_signed);
  const churnedYmd = toYmd(client.churned_at);
  const launchLabel = formatYmdLabel(launchYmd);
  const signedLabel = formatYmdLabel(signedYmd);
  const churned = (client.lifecycle_status ?? "") === "churned";
  const sinceLaunchAvailable = Boolean(launchYmd && launchYmd <= today);

  if (churned) {
    const end = churnedYmd && launchYmd && churnedYmd >= launchYmd ? churnedYmd : today;
    if (launchYmd && end >= launchYmd) {
      const dur = calendarDuration(launchYmd, end);
      return {
        phase: "churned",
        launchYmd,
        launchLabel,
        signedLabel,
        liveLabel: `Was live ${formatDurationParts(dur)}`,
        engagementMonth: null,
        daysLive: Math.max(0, dur.totalDays),
        sinceLaunchAvailable,
      };
    }
    return {
      phase: "churned",
      launchYmd,
      launchLabel,
      signedLabel,
      liveLabel: "Churned",
      engagementMonth: null,
      daysLive: null,
      sinceLaunchAvailable,
    };
  }

  if (launchYmd && launchYmd > today) {
    const dur = calendarDuration(today, launchYmd);
    return {
      phase: "prelaunch",
      launchYmd,
      launchLabel,
      signedLabel,
      liveLabel: `Goes live in ${formatDurationParts(dur)}`,
      engagementMonth: null,
      daysLive: null,
      sinceLaunchAvailable: false,
    };
  }

  if (launchYmd) {
    const dur = calendarDuration(launchYmd, today);
    const wholeMonths = dur.years * 12 + dur.months;
    return {
      phase: "live",
      launchYmd,
      launchLabel,
      signedLabel,
      liveLabel: dur.totalDays === 0 ? "Launched today" : formatDurationParts(dur),
      engagementMonth: wholeMonths + 1,
      daysLive: Math.max(0, dur.totalDays),
      sinceLaunchAvailable: true,
    };
  }

  if (signedYmd) {
    return {
      phase: "signed",
      launchYmd: null,
      launchLabel: null,
      signedLabel,
      liveLabel: "Not launched yet",
      engagementMonth: null,
      daysLive: null,
      sinceLaunchAvailable: false,
    };
  }

  return {
    phase: "unknown",
    launchYmd: null,
    launchLabel: null,
    signedLabel: null,
    liveLabel: "Launch date not on file",
    engagementMonth: null,
    daysLive: null,
    sinceLaunchAvailable: false,
  };
}

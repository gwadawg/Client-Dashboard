/** Inclusive calendar-day window ending on `todayYmd`. */
export function inclusiveDateWindow(
  todayYmd: string,
  windowDays: number,
): { start: string; end: string } {
  const days = Math.max(1, Math.floor(windowDays));
  return {
    start: addDaysYmd(todayYmd, -(days - 1)),
    end: todayYmd,
  };
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`);
  const d = new Date(t + deltaDays * 86400000);
  return d.toISOString().slice(0, 10);
}

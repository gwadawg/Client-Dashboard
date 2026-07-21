/** YYYY-MM and inclusive date bounds for the calendar month of `endDate` (or today). */
export function calendarMonthOf(endDate: string | null | undefined): {
  month: string;
  startDate: string;
  endDate: string;
} {
  const raw = (endDate ?? '').trim();
  const base = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : new Date().toISOString().slice(0, 10);
  const year = Number(base.slice(0, 4));
  const monthIndex = Number(base.slice(5, 7)) - 1;
  const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return {
    month,
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

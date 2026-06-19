// Shared formatters for the acquisition KPI dashboard.

export function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1000) return "$" + Math.round(v).toLocaleString();
  return "$" + v.toFixed(v < 10 ? 2 : 0);
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v) + "%";
}

export function fmtNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString();
}

export function fmtDecimal(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(decimals);
}

/**
 * Detect silent PostgREST / hard-cap truncation on capped event pulls.
 * Hitting `limit` means KPIs may undercount — fail closed in production unless overridden.
 */

export function rowsHitCap(rowCount: number, limit: number): boolean {
  return rowCount >= limit;
}

export function truncationMessage(label: string, limit: number): string {
  return `${label} truncated at ${limit} rows; KPIs may be incomplete. Narrow the date range or use the SQL RPC path.`;
}

/**
 * If rows hit the cap: throw in production (unless ALLOW_TRUNCATED_METRICS=1),
 * otherwise return a warning string for callers to log/attach.
 */
export function enforceRowCap(
  rowCount: number,
  limit: number,
  label: string,
): string | null {
  if (!rowsHitCap(rowCount, limit)) return null;
  const message = truncationMessage(label, limit);
  const allow =
    process.env.ALLOW_TRUNCATED_METRICS === '1' ||
    process.env.NODE_ENV !== 'production';
  if (!allow) throw new Error(message);
  return message;
}

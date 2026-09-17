/** Closes with mapping_status = 'dismissed' are kept for audit but excluded from KPI rollups. */

export const DISMISSED_CLOSE_STATUS = 'dismissed' as const;

export type CloseMappingStatus = 'mapped' | 'pending_client' | typeof DISMISSED_CLOSE_STATUS;

export type ActiveCloseRow = {
  mapping_status?: string | null;
  deleted_at?: string | null;
};

export function isReportingClose(row: ActiveCloseRow): boolean {
  return row.mapping_status !== DISMISSED_CLOSE_STATUS && !row.deleted_at;
}

export function filterReportingCloses<T extends ActiveCloseRow>(rows: T[]): T[] {
  return rows.filter(isReportingClose);
}

/**
 * New-logo CAC / signed_closes denominator.
 * Missing, null, and `standard` count; only explicit `reinstate` is excluded.
 * Closer credit and payroll keep reinstate rows — do not use this filter there.
 */
export function countsTowardCacDenominator(
  closeKind: string | null | undefined,
): boolean {
  return closeKind !== 'reinstate';
}

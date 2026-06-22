/** Closes with mapping_status = 'dismissed' are kept for audit but excluded from KPI rollups. */

export const DISMISSED_CLOSE_STATUS = 'dismissed' as const;

export type CloseMappingStatus = 'mapped' | 'pending_client' | typeof DISMISSED_CLOSE_STATUS;

export function isReportingClose(row: { mapping_status?: string | null }): boolean {
  return row.mapping_status !== DISMISSED_CLOSE_STATUS;
}

export function filterReportingCloses<T extends { mapping_status?: string | null }>(rows: T[]): T[] {
  return rows.filter(isReportingClose);
}

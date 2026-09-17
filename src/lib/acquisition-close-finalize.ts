/** Decide how roster/form ingest should treat an existing close for a client. */

export type FinalizeExistingClose = {
  id: string;
  close_kind?: string | null;
};

export type FinalizeClosePlan =
  | { action: 'insert' }
  | { action: 'update'; id: string }
  | { action: 'skip_reinstate'; id: string };

/**
 * After unique(client_id) was dropped, a client can have multiple closes.
 * Prefer the most recent non-dismissed row: update a standard close, never
 * overwrite a reinstate/winback, insert only when none exist.
 */
export function resolveFinalizeClosePlan(
  existing: FinalizeExistingClose | null,
): FinalizeClosePlan {
  if (!existing) return { action: 'insert' };
  if (existing.close_kind === 'reinstate') {
    return { action: 'skip_reinstate', id: existing.id };
  }
  return { action: 'update', id: existing.id };
}

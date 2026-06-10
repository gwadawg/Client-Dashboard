// Keep is_live aligned with lifecycle when the API doesn't send an explicit override.

const OFFLINE_LIFECYCLES = new Set(['paused', 'off_boarding', 'churned']);

export function syncIsLiveWithLifecycle(
  lifecycle: string | null | undefined,
  explicitIsLive: boolean | undefined,
): boolean | undefined {
  if (explicitIsLive !== undefined) return explicitIsLive;
  if (!lifecycle) return undefined;
  if (lifecycle === 'active') return true;
  if (OFFLINE_LIFECYCLES.has(lifecycle)) return false;
  return undefined;
}

export const DEPARTURE_LIFECYCLE_STATUSES = ['churned', 'off_boarding'] as const;

// is_live is derived from lifecycle — only launched (active) clients feed reporting views.

/** True only when the client has completed launch and is in fulfillment. */
export function syncIsLiveWithLifecycle(lifecycle: string | null | undefined): boolean {
  return lifecycle === 'active';
}

export const DEPARTURE_LIFECYCLE_STATUSES = ['churned', 'off_boarding'] as const;

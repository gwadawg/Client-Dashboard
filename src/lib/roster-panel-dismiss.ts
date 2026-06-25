const STORAGE_PREFIX = 'roster-panel-dismissed:';

type DismissRecord = { count: number; at: number };

function readRecord(key: string): DismissRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DismissRecord;
    if (typeof parsed.count !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Panel stays hidden until the live count exceeds what was dismissed. */
export function isRosterPanelDismissed(key: string, currentCount: number): boolean {
  const record = readRecord(key);
  if (!record) return false;
  return currentCount <= record.count;
}

export function dismissRosterPanel(key: string, currentCount: number): void {
  if (typeof window === 'undefined') return;
  const record: DismissRecord = { count: currentCount, at: Date.now() };
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(record));
}

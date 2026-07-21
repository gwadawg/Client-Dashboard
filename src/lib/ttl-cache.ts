/**
 * Tiny process-local TTL cache for hot read paths.
 * Survives across requests on the same Node/serverless isolate; not shared across instances.
 */

type Entry<T> = { value: T; expiresAt: number };

export function createTtlCache<T>(defaultTtlMs: number) {
  const store = new Map<string, Entry<T>>();

  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() > hit.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T, ttlMs = defaultTtlMs): void {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      // Soft cap so long-lived isolates don't grow forever.
      if (store.size > 200) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    },
    delete(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
}

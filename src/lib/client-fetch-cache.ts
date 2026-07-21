/**
 * Tiny browser-side JSON fetch cache with stale-while-revalidate semantics.
 * Avoids cold refetches when switching dashboard tabs within the stale window.
 */

type CacheEntry = {
  data: unknown;
  fetchedAt: number;
};

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_STALE_MS = 30_000;
const MAX_ENTRIES = 80;

function touchCap() {
  if (store.size <= MAX_ENTRIES) return;
  const oldest = store.keys().next().value;
  if (oldest !== undefined) store.delete(oldest);
}

export type CachedJsonOptions = {
  staleTime?: number;
  signal?: AbortSignal;
  /** When true, always revalidate in background but return stale data immediately if present. */
  preferCache?: boolean;
};

/**
 * Fetch JSON with a process-global (tab) cache keyed by `key`.
 * Concurrent callers with the same key share one in-flight request.
 */
export async function cachedJsonFetch<T>(
  key: string,
  url: string,
  opts: CachedJsonOptions = {},
): Promise<T> {
  const staleTime = opts.staleTime ?? DEFAULT_STALE_MS;
  const hit = store.get(key);
  const fresh = hit && Date.now() - hit.fetchedAt < staleTime;

  if (fresh) return hit.data as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    const res = await fetch(url, { signal: opts.signal });
    const data = (await res.json()) as T;
    if (!opts.signal?.aborted) {
      store.set(key, { data, fetchedAt: Date.now() });
      touchCap();
    }
    return data;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);

  // Stale-while-revalidate: return expired cache immediately while refresh runs.
  if (hit && opts.preferCache !== false) {
    promise.catch(() => undefined);
    return hit.data as T;
  }

  return promise as Promise<T>;
}

export function peekCachedJson<T>(key: string): T | undefined {
  const hit = store.get(key);
  return hit ? (hit.data as T) : undefined;
}

export function invalidateCachedJson(keyPrefix?: string): void {
  if (!keyPrefix) {
    store.clear();
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(keyPrefix)) store.delete(k);
  }
}

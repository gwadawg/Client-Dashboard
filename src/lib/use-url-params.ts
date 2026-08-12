"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type UrlParams = {
  get: (key: string) => string;
  set: (key: string, value: string | null) => void;
  setMany: (values: Record<string, string | null>) => void;
};

/**
 * Read/write individual URL search params from a leaf component, so a filtered
 * table is a shareable link rather than state that dies on unmount.
 *
 * Writes read the live query string instead of the closed-over `searchParams`,
 * which keeps two components updating different params in the same tick from
 * overwriting each other with a stale snapshot.
 */
export function useUrlParams(): UrlParams {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setMany = useCallback(
    (values: Record<string, string | null>) => {
      const params = new URLSearchParams(
        typeof window === "undefined" ? "" : window.location.search,
      );
      let changed = false;
      for (const [key, value] of Object.entries(values)) {
        const current = params.get(key);
        if (value === null || value === "") {
          if (current !== null) {
            params.delete(key);
            changed = true;
          }
        } else if (current !== value) {
          params.set(key, value);
          changed = true;
        }
      }
      if (!changed) return;
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const set = useCallback(
    (key: string, value: string | null) => setMany({ [key]: value }),
    [setMany],
  );

  const get = useCallback((key: string) => searchParams.get(key) ?? "", [searchParams]);

  return { get, set, setMany };
}

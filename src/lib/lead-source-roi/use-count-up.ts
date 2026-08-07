"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 420;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Tweens to `value` so a prospect's eye can follow a number moving when a
 * field is edited live on a call.
 *
 * While idle no state is held at all — the raw `value` passes straight
 * through. State exists only for the frames of an in-flight tween, and is
 * released back to null when it lands.
 */
export function useCountUp(value: number | null): number | null {
  const [tween, setTween] = useState<number | null>(null);
  const shownRef = useRef<number | null>(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = shownRef.current;

    if (
      value == null ||
      from == null ||
      !Number.isFinite(value) ||
      !Number.isFinite(from) ||
      from === value ||
      prefersReducedMotion()
    ) {
      shownRef.current = value;
      return;
    }

    const start = performance.now();
    const delta = value - from;
    const origin = from;

    function step(now: number) {
      const t = Math.min(1, (now - start) / DURATION_MS);
      // easeOutCubic — fast commit, soft landing.
      const eased = 1 - Math.pow(1 - t, 3);

      if (t < 1) {
        const next = origin + delta * eased;
        shownRef.current = next;
        setTween(next);
        frameRef.current = requestAnimationFrame(step);
      } else {
        shownRef.current = value;
        setTween(null);
      }
    }

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [value]);

  if (value == null) return null;
  return tween ?? value;
}

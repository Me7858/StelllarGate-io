import { useEffect, useRef, useState } from "react";

/**
 * Tracks an element's content width. Returns `fallback` until measured, so
 * SSR and the first client render agree; charts pass their preferred width
 * as the fallback and a `max-width` container, which keeps height fixed and
 * avoids layout shift when the real width arrives.
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

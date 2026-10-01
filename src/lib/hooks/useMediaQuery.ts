import { useCallback, useSyncExternalStore } from "react";

/**
 * `window.matchMedia(query).matches`, kept live. The server snapshot is
 * always `false`, so anything gated on this renders the desktop variant in
 * SSR and hydration — use it only for UI that appears after interaction
 * (e.g. choosing bottom sheet vs side panel for the ticket), and prefer CSS
 * media/container queries for anything visible on first paint.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

export const COMPACT_LAYOUT_QUERY = "(max-width: 1024px)";

import { useSyncExternalStore } from "react";

/** One list per query, made once: `getSnapshot` runs on every render (212). */
const lists = new Map<string, MediaQueryList>();

function listOf(query: string): MediaQueryList {
  let m = lists.get(query);
  if (!m) {
    m = window.matchMedia(query);
    lists.set(query, m);
  }
  return m;
}

/** Whether a media query matches, kept up to date. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (l) => {
      const m = listOf(query);
      m.addEventListener("change", l);
      return () => {
        m.removeEventListener("change", l);
      };
    },
    () => listOf(query).matches,
  );
}

/** The player asked for less motion: no pulsing, and camera cuts instead of pans (213). */
export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");

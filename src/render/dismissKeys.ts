import { useEffect, useRef } from "react";

/** Taps and Space this soon after a panel opens are a late swing, not a dismissal. */
export const GRACE_MS = 400;

/**
 * What a key does to an open panel: dismiss it, swallow it (Space or Enter
 * pressed within the grace period), or nothing (other keys, and a held one).
 */
export function dismissKey(
  k: { readonly code: string; readonly repeat: boolean },
  sinceOpen: number,
  graceMs = GRACE_MS,
): "dismiss" | "swallow" | "ignore" {
  if (k.repeat || (k.code !== "Space" && k.code !== "Enter")) return "ignore";
  return sinceOpen < graceMs ? "swallow" : "dismiss";
}

/**
 * Calls `onDismiss` on Space or Enter, but not for a held key or one pressed
 * in the first `graceMs` (201). The grace restarts when `opening` changes.
 * Returns whether a tap now should dismiss.
 */
export function useDismissKeys(
  onDismiss: () => void,
  opening: unknown,
  graceMs = GRACE_MS,
): () => boolean {
  const opened = useRef(0);
  // The latest callback, so a parent's re-render doesn't restart the grace.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });
  useEffect(() => {
    opened.current = performance.now();
    const down = (k: KeyboardEvent) => {
      const what = dismissKey(k, performance.now() - opened.current, graceMs);
      if (what === "ignore") return;
      k.preventDefault();
      if (what === "dismiss") dismiss.current();
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
  }, [opening, graceMs]);
  return () => performance.now() - opened.current >= graceMs;
}

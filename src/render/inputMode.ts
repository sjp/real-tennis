import { useSyncExternalStore } from "react";
import { useSettings } from "./settings.ts";

/** Whether the last input was a touch rather than a key. Starts from the kind of screen. */
let touched = "matchMedia" in globalThis && matchMedia("(pointer: coarse)").matches;
const listeners = new Set<() => void>();

function set(t: boolean) {
  if (t === touched) return;
  touched = t;
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (e) => {
      set(e.pointerType === "touch" || touched);
    },
    {
      capture: true,
    },
  );
  window.addEventListener(
    "keydown",
    () => {
      set(false);
    },
    { capture: true },
  );
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Whether to show the touch controls: by the setting, or on "auto" after a touch. */
export function useTouchShown(): boolean {
  const mode = useSettings().touch;
  const last = useSyncExternalStore(subscribe, () => touched);
  return mode === "on" || (mode === "auto" && last);
}

/** A phone-sized window. */
const SMALL = "(max-width: 700px), (max-height: 500px)";
const small = "matchMedia" in globalThis ? matchMedia(SMALL) : null;

const subscribeSmall = (l: () => void) => {
  small?.addEventListener("change", l);
  return () => small?.removeEventListener("change", l);
};

/** Whether to keep the HUD light: on touch, or in a phone-sized window. */
export function useCompact(): boolean {
  const touchShown = useTouchShown();
  const isSmall = useSyncExternalStore(subscribeSmall, () => small?.matches ?? false);
  return touchShown || isSmall;
}

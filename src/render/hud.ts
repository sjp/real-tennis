import { useSyncExternalStore } from "react";

export type HudChange<H> = Partial<H> | ((old: H) => Partial<H>);

/**
 * A playing screen's HUD, kept outside React: the game loop writes it, and only
 * the components that show a piece of it re-render, not the 3D scene.
 */
export interface HudStore<H> {
  readonly get: () => H;
  readonly set: (change: HudChange<H>) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createHud<H extends object>(initial: H): HudStore<H> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (change) => {
      const c = typeof change === "function" ? change(state) : change;
      const keys = Object.keys(c) as (keyof H)[];
      if (keys.every((k) => c[k] === state[k])) return;
      state = { ...state, ...c };
      for (const l of listeners) l();
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** The part of the HUD a component shows; it re-renders only when that changes. */
export function useHud<H, T>(store: HudStore<H>, pick: (h: H) => T): T {
  return useSyncExternalStore(store.subscribe, () => pick(store.get()));
}

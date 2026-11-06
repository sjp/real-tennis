import { useSyncExternalStore } from "react";
import { featureShape } from "../court/features.ts";
import { standardCourt as court } from "../court/standard.ts";
import type { Vec3 } from "../court/types.ts";
import { EXPLANATIONS } from "../teach/content.ts";
import { TEACHING, type TeachingId } from "../rules/teaching.ts";
import type { TeachingEvent } from "../rules/teaching.ts";
import { advance, explainer, heard, type Explainer } from "../teach/explain.ts";

const SEEN = "realTennis.explained";
const ON = "realTennis.explanations";

/** The explanations' state, kept outside React so the game loop can read it. */
export interface ExplainStore {
  readonly get: () => Explainer;
  readonly set: (e: Explainer) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

function load(): Explainer {
  try {
    const seen: unknown = JSON.parse(localStorage.getItem(SEEN) ?? "[]");
    const ids = Array.isArray(seen) ? seen.filter((id): id is TeachingId => id in TEACHING) : [];
    return explainer(ids, localStorage.getItem(ON) !== "off");
  } catch {
    return explainer();
  }
}

function save(e: Explainer) {
  try {
    localStorage.setItem(SEEN, JSON.stringify(e.seen));
    localStorage.setItem(ON, e.on ? "on" : "off");
  } catch {
    // Storage can be unavailable (private windows); explanations just repeat.
  }
}

export function createExplainStore(): ExplainStore {
  let state = load();
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (e) => {
      if (e === state) return;
      const persist = e.seen !== state.seen || e.on !== state.on;
      state = e;
      if (persist) save(e);
      for (const l of listeners) l();
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useExplainer(store: ExplainStore): Explainer {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** Hears a step's calls, and shows the next explanation once the rest is `quiet`. */
export function explainCalls(store: ExplainStore, calls: readonly TeachingEvent[], quiet: boolean) {
  store.set(advance(heard(store.get(), calls), quiet));
}

/** Where the camera looks while a call is explained, if it's about part of the court. */
export function focusOf(store: ExplainStore): Vec3 | null {
  const showing = store.get().showing;
  const f = showing && EXPLANATIONS[showing].feature;
  return f ? featureShape(court, f).label : null;
}

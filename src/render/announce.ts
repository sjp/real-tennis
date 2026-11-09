import { createContext, use } from "react";
import { createHud } from "./hud.ts";

/** One thing said, numbered so the same words said twice are announced twice. */
export interface Said {
  readonly n: number;
  readonly text: string;
}

/** How many recent announcements the live region keeps. */
const KEPT = 3;

/**
 * What a screen's live region reads out (213): the Marker's calls, the rest
 * result and the score, explanation titles. Each `say` adds a node, so a
 * screen reader reads it even when the words repeat.
 */
export interface Announcer {
  /** The latest announcements, oldest first. */
  readonly get: () => readonly Said[];
  readonly subscribe: (listener: () => void) => () => void;
  /** Reads out `parts` as one announcement; empty parts are left out. */
  readonly say: (...parts: readonly (string | null | undefined)[]) => void;
}

/** `parts` as one sentence each: "Fault. Second service". */
export function sentence(parts: readonly (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => !!p)
    .map((p) => p.trim().replace(/[.\s]+$/, ""))
    .filter((p) => p.length > 0)
    .join(". ");
}

export function createAnnouncer(): Announcer {
  let n = 0;
  const store = createHud<{ list: readonly Said[] }>({ list: [] });
  return {
    get: () => store.get().list,
    subscribe: store.subscribe,
    say: (...parts) => {
      const text = sentence(parts);
      if (!text) return;
      n += 1;
      store.set((s) => ({ list: [...s.list, { n, text }].slice(-KEPT) }));
    },
  };
}

/** A `PlayStage`'s announcer, for the screen inside it. */
export const AnnouncerContext = createContext<Announcer | null>(null);

/** The live region of the `PlayStage` above: what a screen reader reads out. */
export function useAnnouncer(): Announcer {
  const a = use(AnnouncerContext);
  if (!a) throw new Error("An announcer needs a PlayStage");
  return a;
}

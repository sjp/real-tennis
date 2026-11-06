import { useSyncExternalStore } from "react";
import type { AiLevel } from "../ai/presets.ts";
import type { MatchConfig } from "../rules/match.ts";

const KEY = "realTennis.settings";

/** When the touch controls show: on the first touch, always, or never. */
export type TouchMode = "auto" | "on" | "off";

export interface MatchSetup {
  readonly level: AiLevel;
  readonly sets: MatchConfig["sets"];
  readonly suddenDeath: boolean;
}

/** What the player has chosen, remembered across visits. Explanations keep their own store. */
export interface Settings {
  /** Master volume, 0 to 1. */
  readonly volume: number;
  readonly assist: boolean;
  /** Strike rally balls automatically on running into them (130). */
  readonly autoHit: boolean;
  readonly touch: TouchMode;
  /** The last match set up from the start panel. */
  readonly match: MatchSetup;
}

export const DEFAULTS: Settings = {
  volume: 0.7,
  assist: true,
  autoHit: true,
  touch: "auto",
  match: { level: "easy", sets: 1, suddenDeath: false },
};

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Settings from stored JSON, keeping the default for anything missing or wrong. */
export function parseSettings(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const m = (typeof r.match === "object" && r.match !== null ? r.match : {}) as Record<
    string,
    unknown
  >;
  const d = DEFAULTS;
  return {
    volume: typeof r.volume === "number" && r.volume >= 0 && r.volume <= 1 ? r.volume : d.volume,
    assist: typeof r.assist === "boolean" ? r.assist : d.assist,
    autoHit: typeof r.autoHit === "boolean" ? r.autoHit : d.autoHit,
    touch: pick(r.touch, ["auto", "on", "off"] as const, d.touch),
    match: {
      level: pick(m.level, ["easy", "medium", "hard"] as const, d.match.level),
      sets: pick(m.sets, [1, 3, 5] as const, d.match.sets),
      suddenDeath: typeof m.suddenDeath === "boolean" ? m.suddenDeath : d.match.suddenDeath,
    },
  };
}

function load(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Without storage, settings last until the page is closed.
  }
}

/** The settings, kept outside React so game loops and the audio can read them. */
export interface SettingsStore {
  readonly get: () => Settings;
  readonly set: (change: Partial<Settings>) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createSettingsStore(): SettingsStore {
  let state = load();
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (change) => {
      state = { ...state, ...change };
      save(state);
      for (const l of listeners) l();
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** The one store for the page. */
export const settings = createSettingsStore();

export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, settings.get);
}

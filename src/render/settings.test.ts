import { describe, expect, it } from "vitest";
import { createSettingsStore, DEFAULTS, parseSettings } from "./settings.ts";

describe("parseSettings", () => {
  it("keeps valid values", () => {
    const s = {
      volume: 0.2,
      assist: false,
      autoHit: false,
      touch: "on",
      match: { level: "hard", sets: 5, suddenDeath: true },
    };
    expect(parseSettings(s)).toEqual(s);
  });

  it("falls back to the defaults for anything missing or wrong", () => {
    expect(parseSettings(null)).toEqual(DEFAULTS);
    expect(parseSettings("x")).toEqual(DEFAULTS);
    expect(
      parseSettings({ volume: 3, assist: "yes", touch: "maybe", match: { level: "pro", sets: 2 } }),
    ).toEqual(DEFAULTS);
    expect(parseSettings({ volume: 0 }).volume).toBe(0);
  });
});

describe("createSettingsStore", () => {
  it("works without storage, and tells listeners of changes", () => {
    const store = createSettingsStore();
    let heard = 0;
    store.subscribe(() => heard++);
    store.set({ assist: false });
    expect(store.get().assist).toBe(false);
    expect(store.get().volume).toBe(DEFAULTS.volume);
    expect(heard).toBe(1);
  });
});

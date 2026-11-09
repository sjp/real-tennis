import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { startMatch } from "../rules/match.ts";
import { chasesOf, choiceOf, createStore } from "./playState.ts";

describe("createStore", () => {
  it("holds what was last set", () => {
    const s = createStore({ n: 1 });
    s.set({ n: 2 });
    expect(s.get()).toEqual({ n: 2 });
  });
});

describe("choiceOf", () => {
  it("shows the serve style while serving, else the shot", () => {
    expect(choiceOf({ serve: "ready", serveStyle: 0, shot: "drive" })).toBe("Serve: Railroad");
    expect(choiceOf({ serve: null, serveStyle: 0, shot: "drive" })).toBe("Shot: drive");
  });
});

describe("chasesOf", () => {
  it("shows the chases being played off, else those laid", () => {
    const m = startMatch(court, { players: ["human", "ai"], sets: 1, suddenDeath: false }, "human");
    const chase = { side: "service", distance: 2 } as never;
    expect(chasesOf({ ...m, chases: [chase] })).toEqual({ chases: [chase], playingOff: false });
    expect(chasesOf({ ...m, chases: [chase], playOff: [chase, chase] })).toEqual({
      chases: [chase, chase],
      playingOff: true,
    });
  });
});

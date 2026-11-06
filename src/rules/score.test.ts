import { describe, expect, it } from "vitest";
import { chaseName } from "../court/chase.ts";
import { standardCourt as court } from "../court/standard.ts";
import { playRest, startMatch, type MatchState } from "./match.ts";
import type { RallyOutcome } from "./rally.ts";
import { callChase, callScore } from "./score.ts";

const H = "human";
const AI = "ai";
const labels = { [H]: "Player", [AI]: "Opponent" };
const start = startMatch(court, { players: [H, AI], sets: 3, suddenDeath: false }, H);
const win = (winner: string): RallyOutcome => ({ kind: "point", winner, reason: "dedans" });
const two = chaseName(court, { side: "service", distance: 1.6 });

const after = (outcomes: readonly RallyOutcome[], m: MatchState = start) =>
  outcomes.reduce((s, o) => playRest(s, o).state, m);
const call = (...winners: string[]) => callScore(after(winners.map(win)), labels);
const times = (n: number, winner: string) => Array.from({ length: n }, () => winner);

describe("callScore", () => {
  it("calls the points with the last winner's score first (Law 12.1)", () => {
    expect(call()).toBe("Love all");
    expect(call(H)).toBe("Fifteen–love");
    expect(call(H, AI)).toBe("Fifteen all");
    expect(call(H, H, AI)).toBe("Fifteen–thirty");
    expect(call(H, H, H, AI, AI, AI)).toBe("Deuce");
    expect(call(H, H, H, AI, AI, AI, AI)).toBe("Advantage Opponent");
  });

  it("calls players by role, not name", () => {
    expect(call(H, H, H, AI, AI, AI, H)).toBe("Advantage Player");
  });

  it("calls the game and the games", () => {
    expect(call(H, H, H, H)).toBe("Game Player, one game to love");
    const games = [...times(8, H), ...times(4, AI)];
    expect(call(...games)).toBe("Game Opponent, two games to one");
    expect(call(...games, ...times(4, AI))).toBe("Game Opponent, two games all");
  });

  it("calls the set", () => {
    const set = times(24, AI);
    expect(call(...set)).toBe("Game Opponent, set Opponent, one set to love");
    expect(call(...set, H)).toBe("Fifteen–love");
  });

  it("calls the match", () => {
    expect(call(...times(48, H))).toBe("Game, set and match Player");
  });

  it("adds the chases outstanding", () => {
    const m = after([win(H), win(AI), win(H), { kind: "chase", call: two, reason: "chaseLaid" }]);
    expect(callScore(m, labels)).toBe("Thirty–fifteen, chase better than two (1.60 m)");
  });

  it("calls forty all under sudden death (Law 12.1(b))", () => {
    const sudden = { ...start, config: { ...start.config, suddenDeath: true } };
    const m = after([H, H, H, AI, AI, AI].map(win), sudden);
    expect(callScore(m, labels)).toBe("Forty all");
  });
});

describe("callChase", () => {
  it("doesn't say chase twice", () => {
    const line = chaseName(court, { side: "service", distance: 14 });
    expect(callChase(line)).toBe("chase the line (14.00 m)");
    expect(callChase(chaseName(court, { side: "hazard", distance: 1 }))).toMatch(
      /^chase .*hazard.*from the service line\)$/,
    );
  });
});

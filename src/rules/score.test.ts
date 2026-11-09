import { describe, expect, it } from "vitest";
import { chaseName } from "../court/chase.ts";
import { standardCourt as court } from "../court/standard.ts";
import { playRest, startMatch, type MatchState } from "./match.ts";
import type { RallyOutcome } from "./rally.ts";
import { callChase, callGames, callPoints, callScore, callSets, pointsShown } from "./score.ts";

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

describe("callPoints", () => {
  const points = (h: number, ai: number, lastPoint: string | null) =>
    callPoints({ ...start, points: { [H]: h, [AI]: ai }, lastPoint }, labels);

  it("calls the server's score first before any point is won", () => {
    expect(points(0, 0, null)).toBe("Love all");
    const serving = { ...start, server: AI, points: { [H]: 0, [AI]: 2 } };
    expect(callPoints(serving, labels)).toBe("Thirty–love");
  });

  it("calls the last winner's score first, even when behind (Law 12.1)", () => {
    expect(points(1, 3, H)).toBe("Fifteen–forty");
    expect(points(1, 3, AI)).toBe("Forty–fifteen");
  });

  it("calls deuce, and the advantage by role, however far the game goes", () => {
    expect(points(5, 5, AI)).toBe("Deuce");
    expect(points(6, 5, AI)).toBe("Advantage Player");
    expect(points(5, 6, AI)).toBe("Advantage Opponent");
  });
});

describe("callGames and callSets", () => {
  const m = (t: Partial<MatchState>) => ({ ...start, ...t });

  it("say nothing at love all", () => {
    expect(callGames(start)).toBe("");
    expect(callSets(start)).toBe("");
  });

  it("call the leader's tally first, whoever won the last game", () => {
    const games = { [H]: 1, [AI]: 4 };
    expect(callGames(m({ games, lastGame: AI }))).toBe("Four games to one");
    expect(callGames(m({ games, lastGame: H }))).toBe("Four games to one");
  });

  it("use the singular only when the lead is one", () => {
    expect(callGames(m({ games: { [H]: 1, [AI]: 0 }, lastGame: H }))).toBe("One game to love");
    expect(callGames(m({ games: { [H]: 1, [AI]: 1 }, lastGame: H }))).toBe("One game all");
    expect(callGames(m({ games: { [H]: 6, [AI]: 6 }, lastGame: AI }))).toBe("Six games all");
  });

  it("count sets the same way", () => {
    expect(callSets(m({ sets: { [H]: 2, [AI]: 1 }, lastGame: H }))).toBe("Two sets to one");
    expect(callSets(m({ sets: { [H]: 1, [AI]: 1 }, lastGame: AI }))).toBe("One set all");
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

describe("pointsShown", () => {
  const shown = (...winners: string[]) => {
    const m = after(winners.map(win));
    return [pointsShown(m, H), pointsShown(m, AI)];
  };

  it("shows love, fifteen, thirty and forty as numbers", () => {
    expect(shown()).toEqual(["0", "0"]);
    expect(shown(H)).toEqual(["15", "0"]);
    expect(shown(H, H, AI)).toEqual(["30", "15"]);
    expect(shown(H, H, H)).toEqual(["40", "0"]);
  });

  it("shows deuce as forty all and the advantage as Adv", () => {
    expect(shown(H, H, H, AI, AI, AI)).toEqual(["40", "40"]);
    expect(shown(H, H, H, AI, AI, AI, AI)).toEqual(["40", "Adv"]);
    expect(shown(H, H, H, AI, AI, AI, AI, H)).toEqual(["40", "40"]);
  });

  it("starts again from love after a game", () => {
    expect(shown(H, H, H, H)).toEqual(["0", "0"]);
  });
});

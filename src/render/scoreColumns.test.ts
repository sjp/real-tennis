import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { playRest, startMatch, type MatchState } from "../rules/match.ts";
import { leads, scoreColumns } from "./scoreColumns.ts";

const H = "human";
const AI = "ai";
const start = (sets: 1 | 3) => startMatch(court, { players: [H, AI], sets, suddenDeath: false }, H);
const after = (m: MatchState, ...winners: string[]) =>
  winners.reduce((s, w) => playRest(s, { kind: "point", winner: w, reason: "dedans" }).state, m);

/** Each column's name, numbers and who is bold, as [name, shown H, shown AI, bold]. */
const board = (m: MatchState) =>
  scoreColumns(m).map((c) => [
    c.name,
    c.shown(H),
    c.shown(AI),
    leads(c, H, AI) ? H : leads(c, AI, H) ? AI : null,
  ]);

describe("scoreColumns", () => {
  it("shows sets only in a match of more than one", () => {
    expect(board(start(1)).map(([n]) => n)).toEqual(["Games", "Points"]);
    expect(board(start(3))).toEqual([
      ["Sets", 0, 0, null],
      ["Games", 0, 0, null],
      ["Points", "0", "0", null],
    ]);
  });

  it("bolds whoever is ahead in each column, and no one when level", () => {
    expect(board(after(start(1), H, H, AI))).toEqual([
      ["Games", 0, 0, null],
      ["Points", "30", "15", H],
    ]);
    const game = after(start(1), H, H, H, H, AI);
    expect(board(game)).toEqual([
      ["Games", 1, 0, H],
      ["Points", "0", "15", AI],
    ]);
  });

  it("ranks Adv over 40, and 40 all as level", () => {
    const deuce = after(start(1), H, H, H, AI, AI, AI);
    expect(board(deuce)[1]).toEqual(["Points", "40", "40", null]);
    expect(board(after(deuce, AI))[1]).toEqual(["Points", "40", "Adv", AI]);
    expect(board(after(deuce, AI, H))[1]).toEqual(["Points", "40", "40", null]);
  });
});

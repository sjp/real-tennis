import { describe, expect, it } from "vitest";
import { chaseName } from "../court/chase.ts";
import { standardCourt as court } from "../court/standard.ts";
import {
  coinToss,
  playRest,
  rallySetup,
  receiverOf,
  startMatch,
  type MatchConfig,
  type MatchState,
} from "./match.ts";
import type { RallyOutcome } from "./rally.ts";

const A = "a";
const B = "b";
const config: MatchConfig = { players: [A, B], sets: 3, suddenDeath: false };
const start = startMatch(court, config, A);

const win = (winner: string): RallyOutcome => ({ kind: "point", winner, reason: "dedans" });
const fault: RallyOutcome = { kind: "fault", reason: "faultDrop" };
const two = chaseName(court, { side: "service", distance: 1.83 });
const hazard = chaseName(court, { side: "hazard", distance: 1 });
const chase = (call = two): RallyOutcome => ({ kind: "chase", call, reason: "chaseLaid" });

function run(outcomes: readonly RallyOutcome[], m: MatchState = start) {
  const teaching: string[] = [];
  for (const o of outcomes) {
    const r = playRest(m, o);
    m = r.state;
    teaching.push(...r.teaching.map((t) => t.id));
  }
  return { m, teaching };
}
const times = <T>(n: number, x: T): T[] => Array.from({ length: n }, () => x);

describe("scoring a game (Law 12.1)", () => {
  it("counts fifteen, thirty, forty, game", () => {
    const { m, teaching } = run(times(4, win(A)));
    expect(m.games).toEqual({ a: 1, b: 0 });
    expect(m.points).toEqual({ a: 0, b: 0 });
    expect(teaching).toEqual(["game"]);
  });

  it("needs two clear after deuce", () => {
    const deuce = [...times(3, win(A)), ...times(3, win(B))];
    expect(run([...deuce, win(A)]).m.games).toEqual({ a: 0, b: 0 });
    expect(run([...deuce, win(A), win(B), win(B), win(B)]).m.games).toEqual({ a: 0, b: 1 });
  });

  it("can play sudden death at forty-all (Law 12.1(b))", () => {
    const sudden = startMatch(court, { ...config, suddenDeath: true }, A);
    const { m, teaching } = run([...times(3, win(A)), ...times(3, win(B)), win(B)], sudden);
    expect(m.games).toEqual({ a: 0, b: 1 });
    expect(teaching).toContain("suddenDeath");
  });
});

describe("sets and the match (Law 13)", () => {
  const game = (p: string) => times(4, win(p));
  const set = (p: string) => times(6, game(p)).flat();

  it("wins a set at six games with no margin, so 6–5 counts", () => {
    const fiveAll = [...times(5, game(A)), ...times(5, game(B))].flat();
    const { m } = run([...fiveAll, ...game(B)]);
    expect(m.sets).toEqual({ a: 0, b: 1 });
    expect(m.setScores).toEqual([{ a: 5, b: 6 }]);
    expect(m.games).toEqual({ a: 0, b: 0 });
  });

  it.each([1, 3, 5] as const)("ends a best of %i match", (sets) => {
    const s = startMatch(court, { ...config, sets }, A);
    const need = Math.ceil(sets / 2);
    const nearly = run(times(need - 1, set(A)).flat(), s);
    expect(nearly.m.winner).toBeNull();
    const { m, teaching } = run(set(A), nearly.m);
    expect(m.winner).toBe(A);
    expect(teaching.at(-1)).toBe("match");
    expect(run([win(B)], m).m).toBe(m);
  });

  it("never changes ends at a game or set (Law 8.2)", () => {
    expect(run(set(B)).m.server).toBe(A);
  });
});

describe("service faults", () => {
  it("loses the rest on two faults in a row (Law 11.2(b))", () => {
    const { m, teaching } = run([fault, fault]);
    expect(m.points).toEqual({ a: 0, b: 1 });
    expect(teaching).toEqual(["doubleFault"]);
  });

  it("keeps an earlier fault after a let (Law 10(e)(iii))", () => {
    expect(run([fault, { kind: "let", reason: "letHindrance" }, fault]).m.points.b).toBe(1);
  });

  it("forgets a fault once a rest is decided, a chase included", () => {
    expect(run([fault, win(A), fault]).m.faults).toBe(1);
    expect(run([fault, chase(), fault]).m.points.b).toBe(0);
  });
});

describe("chases and changing ends (Laws 8.2, 9)", () => {
  it("lays a chase without changing the score (Law 9.2(a))", () => {
    const { m } = run([chase()]);
    expect(m.points).toEqual({ a: 0, b: 0 });
    expect(m.chases).toEqual([two]);
    expect(m.server).toBe(A);
  });

  it("changes ends at two chases and plays them off in order", () => {
    const { m, teaching } = run([chase(), chase(hazard)]);
    expect(m.server).toBe(B);
    expect(receiverOf(m)).toBe(A);
    expect(m.chases).toEqual([]);
    expect(m.playOff).toEqual([two, hazard]);
    expect(rallySetup(m).playingFor).toBe(two);
    expect(teaching).toEqual(["changeEnds", "playOff"]);
  });

  it("changes ends at one chase when a player is on forty, deuce included", () => {
    expect(run([...times(3, win(A)), chase()]).m.server).toBe(B);
    const deuce = [...times(3, win(A)), ...times(3, win(B))];
    expect(run([...deuce, chase()]).m.server).toBe(B);
    expect(run([...times(2, win(A)), chase()]).m.server).toBe(A);
  });

  it("checks after every rest, not only when a chase is laid", () => {
    const { m } = run([...times(2, win(A)), chase(), win(A)]);
    expect(m.server).toBe(B);
    expect(m.playOff).toEqual([two]);
  });

  it("plays off one rest per chase, then lays chases again", () => {
    const { m, teaching } = run([
      chase(),
      chase(hazard),
      win(B),
      { kind: "chaseOff", call: hazard },
    ]);
    expect(m.playOff).toEqual([]);
    expect(m.points).toEqual({ a: 0, b: 1 });
    expect(teaching.filter((t) => t === "playOff")).toHaveLength(2);
    expect(rallySetup(m).playingFor).toBeNull();
    expect(run([chase()], m).m.chases).toEqual([two]);
  });

  it("replays the chase after a let, and keeps it through a single fault", () => {
    const { m } = run([chase(), chase(hazard), { kind: "let", reason: "letNotReady" }, fault]);
    expect(m.playOff).toEqual([two, hazard]);
  });

  it("annuls outstanding chases when the game is won (Laws 8.2(b)(iv), 9.3(c)(iii))", () => {
    // Law 8.2 makes this rare: it needs two chases left with a player on forty.
    const playing = { ...start, points: { a: 3, b: 0 }, server: B, playOff: [two, hazard] };
    const { m, teaching } = run([win(A)], playing);
    expect(m.games).toEqual({ a: 1, b: 0 });
    expect(m.playOff).toEqual([]);
    expect(teaching).toEqual(["game", "chasesAnnulled"]);
    expect(run([...times(2, win(A)), chase(), win(A), win(A)]).teaching).not.toContain(
      "chasesAnnulled",
    );
  });

  it("resets faults on changing ends", () => {
    const { m } = run([chase(), fault, chase(hazard)]);
    expect(m.faults).toBe(0);
  });
});

describe("coin toss (Law 7.1)", () => {
  it("picks either player", () => {
    expect(coinToss([A, B], () => 0.2)).toBe(A);
    expect(coinToss([A, B], () => 0.7)).toBe(B);
  });
});

import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import type { SurfaceId } from "../court/collision.ts";
import { vec } from "../sim/vec.ts";
import { playRest, rallySetup, startMatch, type MatchState } from "./match.ts";
import { rally, startRally, type RallyInput, type RallyOutcome } from "./rally.ts";

const hw = court.floor.width / 2;
const hl = court.floor.length / 2;
const players = ["a", "b"] as const;
const WALLS: readonly SurfaceId[] = [
  "mainWall",
  "sideWall",
  "dedansWall",
  "grilleWall",
  "serviceWall",
  "highBackWall:grille",
  "netPost",
  "post:lastGallery",
  "joue:dedans",
];
const ROOFS: readonly SurfaceId[] = [
  "penthouse:side",
  "penthouse:service",
  "penthouse:grille",
  "penthouse:dedans",
  "penthouseEdge:side",
  "penthouseEdge:service",
];

/** Fuzzed events: plausible shapes, implausible orders, to shake out invalid states. */
function randomInput(random: () => number): RallyInput {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!;
  const position = vec((random() * 2 - 1) * hw, random() * 3, (random() * 2 - 1) * hl);
  const base = { time: 0, position };
  const r = random();
  if (r < 0.01) return { type: "let", reason: pick(["receiverNotReady", "hindrance"] as const) };
  if (r < 0.015) return { type: "serverFault", reason: pick(["line", "missed"] as const) };
  if (r < 0.02) return { type: "netTouched", player: pick(players) };
  if (r < 0.03) return { ...base, type: "outOfCourt", surface: "outOfCourt" };
  if (r < 0.04) return { ...base, type: "playerHit", player: pick(players), surface: "player" };
  if (r < 0.06)
    return { ...base, type: "enteredOpening", opening: pick(court.openings).id, surface: "racket" };
  if (r < 0.2) return { ...base, type: "racketHit", player: pick(players), surface: "racket" };
  if (r < 0.4)
    return {
      ...base,
      type: "netCrossed",
      from: pick(["service", "hazard"] as const),
      surface: "net",
    };
  if (r < 0.65) return { ...base, type: "floorBounce", bounce: 1, surface: "floor" };
  if (r < 0.75) return { ...base, type: "wallHit", surface: pick(WALLS) };
  if (r < 0.85) return { ...base, type: "penthouseHit", edge: false, surface: pick(ROOFS) };
  if (r < 0.9)
    return {
      ...base,
      type: "netHit",
      face: pick(["service", "hazard"] as const),
      cord: random() < 0.3,
      surface: "net",
    };
  if (r < 0.95) return { ...base, type: "tambourHit", surface: "tambour" };
  return { ...base, type: pick(["nick", "restOnFloor"] as const), surface: "floor" };
}

/** Half the time the service is good, so the rest goes on into open play. */
function playRandomRest(m: MatchState, random: () => number): RallyOutcome {
  const setup = rallySetup(m);
  let state = startRally(setup);
  const at = (x: number, y: number, z: number) => ({ time: 0, position: vec(x, y, z) });
  const serve: RallyInput[] = [
    { ...at(hw - 2.5, 2, -5), type: "racketHit", player: setup.server, surface: "racket" },
  ];
  if (random() < 0.5)
    serve.push(
      { ...at(hw, 3, -2), type: "penthouseHit", edge: false, surface: "penthouse:side" },
      { ...at(hw, 3, 0), type: "netCrossed", from: "service", surface: "net" },
      { ...at(hw, 3, 2), type: "penthouseHit", edge: false, surface: "penthouse:service" },
      { ...at(hw - 0.5, 0.03, hl - 1), type: "floorBounce", bounce: 1, surface: "floor" },
    );
  for (const e of [...serve, ...Array.from({ length: 200 }, () => randomInput(random))]) {
    state = rally(state, e).state;
    if (state.outcome) return state.outcome;
  }
  return { kind: "let", reason: "letHindrance" };
}

/** Broken invariants after a rest, as messages. */
function problems(prev: MatchState, m: MatchState, o: RallyOutcome): string[] {
  const p: string[] = [];
  const fail = (ok: boolean, what: string) => ok || p.push(what);
  const max = (t: MatchState["points"]) => Math.max(t.a!, t.b!);
  fail(!(prev.playOff.length > 0 && o.kind === "chase"), "chase laid during a play-off (Law 9.2)");
  fail(players.includes(m.server as "a"), "unknown server");
  fail(m.faults === 0 || m.faults === 1, "fault count");
  fail(max(m.games) < 6, "a set not ended at six games (Law 13)");
  fail(m.sets.a! + m.sets.b! === m.setScores.length, "set count");
  fail(
    m.setScores.every((s) => max(s) === 6),
    "a set not won at six",
  );
  fail(m.chases.length < 2, "two chases without changing ends (Law 8.2)");
  fail(m.chases.length === 0 || max(m.points) < 3, "a chase and forty without changing ends");
  fail(m.chases.length === 0 || m.playOff.length === 0, "chases laid while playing off");
  fail(m.playOff.length <= 2, "more than two chases to play off");
  fail(
    m.server === prev.server ||
      ((prev.chases.length > 0 || o.kind === "chase") && m.playOff.length > 0),
    "ends changed without chases (Law 8.2)",
  );
  const deuce = !m.config.suddenDeath && Math.min(m.points.a!, m.points.b!) >= 3;
  fail(!deuce || Math.abs(m.points.a! - m.points.b!) <= 1, "game not won two clear");
  return p;
}

describe("soak: fuzzed matches through the whole engine", () => {
  it("completes 24 matches without an invalid state", () => {
    const kinds = new Set<string>();
    const found: string[] = [];
    for (let seed = 1; seed <= 24; seed++) {
      let s = seed * 7919;
      const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const sets = ([1, 3, 5] as const)[seed % 3]!;
      const config = { players, sets, suddenDeath: seed % 4 === 0 };
      let m = startMatch(court, config, players[seed % 2]!);
      for (let rests = 0; m.winner === null && rests < 20000; rests++) {
        const o = playRandomRest(m, random);
        kinds.add(o.kind);
        const next = playRest(m, o).state;
        found.push(...problems(m, next, o).map((p) => `seed ${seed}: ${p}`));
        m = next;
      }
      if (m.winner === null || m.sets[m.winner] !== Math.ceil(sets / 2))
        found.push(`seed ${seed}: unfinished`);
    }
    expect(found).toEqual([]);
    expect(kinds).toEqual(new Set(["point", "fault", "chase", "chaseOff", "let"]));
  });
});

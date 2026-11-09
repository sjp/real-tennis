import { describe, expect, it } from "vitest";
import { chaseName } from "../court/chase.ts";
import { standardCourt as court } from "../court/standard.ts";
import { playAi } from "../ai/headless.ts";
import { AI_PRESETS } from "../ai/presets.ts";
import { createWorld } from "../sim/world.ts";
import { startPlay, type PlayState } from "./play.ts";
import { strokesIn, summarise, type Rest } from "./summary.ts";
import type { SimEvent } from "../sim/events.ts";
import { vec } from "../sim/vec.ts";

const rest = (r: Partial<Rest> & Pick<Rest, "outcome">): Rest => ({
  server: "a",
  receiver: "b",
  faults: 0,
  striker: "a",
  playingFor: false,
  strokes: 1,
  ...r,
});
const call = chaseName(court, { side: "service", distance: 11.5 });

describe("summarise", () => {
  it("counts rests, openings, chases, faults and the longest rest", () => {
    const s = summarise(
      ["a", "b"],
      [
        rest({ outcome: { kind: "point", winner: "a", reason: "dedans" }, strokes: 3 }),
        rest({ outcome: { kind: "point", winner: "b", reason: "outOfCourt" }, strokes: 7 }),
        rest({ outcome: { kind: "chase", call, reason: "chaseLaid" }, striker: "b" }),
        rest({
          outcome: { kind: "point", winner: "b", reason: "chaseWon" },
          playingFor: true,
        }),
        rest({ outcome: { kind: "fault", reason: "faultDrop" }, striker: null }),
        rest({ outcome: { kind: "let", reason: "letHindrance" } }),
      ],
    );
    expect(s.longest).toBe(7);
    expect(s.players.a).toMatchObject({ rests: 1, faults: 1, doubleFaults: 0 });
    expect(s.players.a!.openings.dedans).toBe(1);
    expect(s.players.b).toMatchObject({ rests: 2, chasesLaid: 1, chasesWon: 1 });
  });

  it("gives the receiver the rest on a double fault", () => {
    const fault = { kind: "fault", reason: "faultDrop" } as const;
    const s = summarise(
      ["a", "b"],
      [rest({ outcome: fault }), rest({ outcome: fault, faults: 1 })],
    );
    expect(s.players.a).toMatchObject({ faults: 2, doubleFaults: 1, rests: 0 });
    expect(s.players.b!.rests).toBe(1);
  });

  it("adds up over a real game", () => {
    const world = createWorld(court);
    const presets = { a: AI_PRESETS.hard, b: AI_PRESETS.easy };
    const config = { players: ["a", "b"] as const, sets: 1, suddenDeath: false } as const;
    const { state, rests } = playAi(
      world,
      config,
      presets,
      7,
      600,
      (s) => s.match.lastGame !== null,
    );
    const winner = state.match.lastGame!;
    const s = summarise(config.players, rests);
    expect(s.players[winner]!.rests).toBeGreaterThanOrEqual(4);
    expect(s.longest).toBeGreaterThan(0);
  });
});

describe("strokesIn", () => {
  const world = createWorld(court);
  const config = { players: ["a", "b"] as const, sets: 1, suddenDeath: false } as const;
  const playing = startPlay(world, config, () => 0.2, { a: "Player", b: "Opponent" }).state;
  const at = { time: 0, position: vec(0, 1, 0) };
  const hit = (player: string): SimEvent => ({
    ...at,
    type: "racketHit",
    player,
    surface: "racket",
  });
  const wall: SimEvent = { ...at, type: "wallHit", surface: "mainWall" };

  it("counts racket hits only", () => {
    expect(strokesIn(playing, [hit("a"), wall, hit("b")])).toBe(2);
    expect(strokesIn(playing, [wall])).toBe(0);
  });

  it("counts nothing once the rest is called or the match is over", () => {
    for (const phase of ["called", "over"] as const) {
      const s: PlayState = { ...playing, phase };
      expect(strokesIn(s, [hit("a")])).toBe(0);
    }
  });
});

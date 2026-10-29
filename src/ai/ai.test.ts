import { describe, expect, it } from "vitest";
import { chaseName } from "../court/chase.ts";
import { standardCourt as court } from "../court/standard.ts";
import { athleteOf, playStep, startPlay, type PlayState } from "../game/play.ts";
import { playerCapsule } from "../game/player.ts";
import { IDLE, type InputState } from "../input/input.ts";
import { aimAt } from "../player/shot.ts";
import { startRally } from "../rules/rally.ts";
import { vec, ZERO } from "../sim/vec.ts";
import { createWorld, initialState } from "../sim/world.ts";
import { aiInput, FRESH, outcomeValue, type AiMemory } from "./ai.ts";
import { seeded, viewOf } from "./headless.ts";
import { AI_PRESETS, type AiPreset } from "./presets.ts";

const world = createWorld(court);
const config = { players: ["a", "b"] as const, sets: 1 as const, suddenDeath: false };
const labels = { a: "Player", b: "Opponent" };

/** Steps with `ai` playing `id` and the other player idle, until the rest is decided. */
function play(state: PlayState, id: string, preset: AiPreset, seed: number) {
  const random = seeded(seed);
  let memory: AiMemory = FRESH;
  let s = state;
  const hits: string[] = [];
  const calls: string[] = [];
  for (let i = 0; i < 240 * 12 && s.phase === "play"; i++) {
    const r = aiInput(
      world,
      viewOf(s, id),
      preset,
      memory,
      random,
      playerCapsule(athleteOf(s, id)),
    );
    memory = r.memory;
    const inputs: Record<string, InputState> = { a: IDLE, b: IDLE, [id]: r.input };
    const step = playStep(world, s, inputs);
    s = step.state;
    calls.push(...step.calls.map((c) => c.id));
    for (const e of step.events) if (e.type === "racketHit") hits.push(e.player);
  }
  return { state: s, hits, calls };
}

describe("outcomeValue", () => {
  const long = chaseName(court, { side: "hazard", distance: 5 });
  const short = chaseName(court, { side: "hazard", distance: 0.5 });
  const chase = (call = long) => ({ kind: "chase", call, reason: "chaseLaid" }) as const;

  it("values a won rest above a lost one", () => {
    const point = (winner: string) => ({ kind: "point", winner, reason: "dedans" }) as const;
    expect(outcomeValue(world, point("b"), "b", "hazard")).toBe(1);
    expect(outcomeValue(world, point("a"), "b", "hazard")).toBe(0);
  });

  it("is glad of the server's fault", () => {
    const fault = { kind: "fault", reason: "faultDrop" } as const;
    expect(outcomeValue(world, fault, "b", "hazard")).toBeGreaterThan(0.5);
    expect(outcomeValue(world, fault, "a", "service")).toBeLessThan(0.5);
  });

  it("prefers a long chase at its own end, which is easy to beat later", () => {
    const mine = (c: ReturnType<typeof chase>) => outcomeValue(world, c, "b", "hazard");
    expect(mine(chase(long))).toBeGreaterThan(mine(chase(short)));
    expect(outcomeValue(world, chase(short), "a", "service")).toBeGreaterThan(mine(chase(short)));
  });
});

describe("the AI", () => {
  const start = startPlay(world, config, () => 0.2, labels).state;

  it("serves a good service most of the time", () => {
    const good = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((seed) =>
      play(start, "a", AI_PRESETS.hard, seed).calls.includes("goodService"),
    );
    expect(good.length).toBeGreaterThanOrEqual(8);
  });

  it("returns a good service", () => {
    // The human's Railroad, served perfectly from the practice tests' timing.
    const returned = [1, 2, 3, 4, 5, 6].filter((seed) => {
      const served = play(start, "a", AI_PRESETS.hard, seed);
      if (!served.calls.includes("goodService")) return false;
      const random = seeded(seed);
      let memory: Record<string, AiMemory> = { a: FRESH, b: FRESH };
      let s = start;
      for (let i = 0; i < 240 * 12 && s.phase === "play"; i++) {
        const inputs: Record<string, InputState> = {};
        for (const id of ["a", "b"]) {
          const preset = AI_PRESETS.hard;
          const r = aiInput(
            world,
            viewOf(s, id),
            preset,
            memory[id]!,
            random,
            playerCapsule(athleteOf(s, id)),
          );
          memory = { ...memory, [id]: r.memory };
          inputs[id] = r.input;
        }
        const step = playStep(world, s, inputs);
        if (step.events.some((e) => e.type === "racketHit" && e.player === "b")) return true;
        s = step.state;
      }
      return false;
    });
    expect(returned.length).toBeGreaterThanOrEqual(4);
  });

  it("lets a ball go that would lay a chase it can easily beat", () => {
    // A soft ball dropping just over the net at the hazard end.
    const from = vec(0, 2.5, -1);
    const target = vec(0, world.ball.radius, 1);
    const velocity = aimAt(world.ball, from, target, ZERO, { elevation: 0.3 });
    const struck: PlayState = {
      ...start,
      // The receiver close enough to reach it.
      athletes: start.athletes.map((a) =>
        a.id === "b"
          ? { ...a, motion: { position: { x: 1, z: 4 }, velocity: { x: 0, z: 0 } } }
          : { ...a, serve: null },
      ) as never,
      sim: initialState({ position: from, velocity, spin: ZERO }, start.sim.time),
      rally: startRally(start.rally.setup, "a"),
    };
    const sure = (judgement: number) => ({ ...AI_PRESETS.hard, judgement });
    // Without weighing it up, it plays the ball.
    expect(play(struck, "b", sure(0), 1).hits).toEqual(["b"]);
    const { hits, state } = play(struck, "b", sure(1), 1);
    expect(hits).toEqual([]);
    expect(state.rally.outcome).toMatchObject({
      kind: "chase",
      call: { mark: { side: "hazard" } },
    });
  });
});

import { describe, expect, it } from "vitest";
import { chaseName } from "../court/chase.ts";
import { standardCourt as court } from "../court/standard.ts";
import { athleteOf, playStep, startPlay, type PlayState } from "../game/play.ts";
import { playerCapsule, rightX, serveMiss, SIDE_REACH, type Athlete } from "../game/player.ts";
import { forwardZ } from "../player/movement.ts";
import { IDLE, type InputState } from "../input/input.ts";
import { SERVE_STYLES, serveSpot, toss } from "../player/serve.ts";
import { aimAt } from "../player/shot.ts";
import { SWING_TIME } from "../player/timing.ts";
import { startRally } from "../rules/rally.ts";
import { vec, ZERO } from "../sim/vec.ts";
import { createWorld, initialState, predict, STEP } from "../sim/world.ts";
import {
  aiInput,
  basePosition,
  FRESH,
  gaussian,
  outcomeValue,
  serveContact,
  type AiMemory,
} from "./ai.ts";
import { viewOf } from "./headless.ts";
import { seeded } from "../util/random.ts";
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

  it("serves just as well when player b wins the toss", () => {
    // Force the toss, so player b serves whatever the seed.
    const b = startPlay(world, config, () => 0.9, labels).state;
    expect(b.match.server).toBe("b");
    const serves = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) =>
      play(b, "b", AI_PRESETS.hard, seed),
    );
    expect(serves.every((s) => s.hits[0] === "b")).toBe(true);
    const good = serves.filter((s) => s.calls.includes("goodService"));
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
    // Timed perfectly, so only the decision is tested, not its stroke.
    const sure = (judgement: number) => ({ ...AI_PRESETS.hard, judgement, timing: 0 });
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

describe("planning a stroke", () => {
  const start = startPlay(world, config, () => 0.2, labels).state;

  it("never plans a contact closer than SWING_TIME", () => {
    // A ball that has dropped, rising gently just in front of the receiver's
    // forehand: in reach from now until well after SWING_TIME.
    const b = athleteOf(start, "b");
    const me: Athlete = {
      ...b,
      serve: null,
      motion: { position: { x: 1, z: 6 }, velocity: { x: 0, z: 0 } },
    };
    const f = forwardZ(me.end);
    const from = vec(1 + rightX(me.end) * SIDE_REACH, 0.9, 6 + f * 0.3);
    const sim = initialState({ position: from, velocity: vec(0, 1.5, 0), spin: ZERO }, 3);
    const rally = { ...startRally(start.rally.setup, "a"), crossed: true, drop: "hazard" as const };
    const sure = { ...AI_PRESETS.hard, reaction: 0, timing: 0, noise: 0, judgement: 0 };
    const view = { me, sim, rally, live: true, since: 0 };
    const { memory } = aiInput(world, view, sure, FRESH, seeded(1), playerCapsule(me));
    // With perfect timing it swings SWING_TIME before contact: not before now.
    expect(memory.plan?.swingAt).toBeGreaterThanOrEqual(3);
  });
});

describe("gaussian", () => {
  it("is 0 when the first draw is 0", () => {
    const draws = [0, 0.3];
    expect(gaussian(() => draws.shift()!)).toBe(0);
  });

  it("has mean 0 and spread 1, and stays finite at the ends of [0, 1)", () => {
    const random = seeded(42);
    const xs = Array.from({ length: 20_000 }, () => gaussian(random));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(variance).toBeGreaterThan(0.9);
    expect(variance).toBeLessThan(1.1);
    expect(Number.isFinite(gaussian(() => 1 - Number.EPSILON))).toBe(true);
  });
});

describe("basePosition", () => {
  const hl = court.floor.length / 2;

  it("waits in the middle of its own end, 5 m from the end wall", () => {
    expect(basePosition(world, "service")).toEqual({ x: 0.5, z: -(hl - 5) });
    expect(basePosition(world, "hazard")).toEqual({ x: 0.5, z: hl - 5 });
  });
});

describe("serveContact", () => {
  it.each(SERVE_STYLES.map((s, i) => [s.name, i] as const))(
    "meets a tossed %s at the serving hand",
    (_, serveStyle) => {
      const me: Athlete = {
        id: "a",
        motion: { position: serveSpot(court), velocity: { x: 0, z: 0 } },
        end: "service",
        shot: "cut",
        serveStyle,
        swing: null,
        serve: "tossed",
        struck: null,
      };
      const style = SERVE_STYLES[serveStyle]!;
      const sim = initialState(toss(style, me.motion.position, "service", world.ball.gravity), 3);
      const t = serveContact(world, me, sim);
      // Far enough ahead for a swing pressed now to meet it.
      expect(t - 3).toBeGreaterThanOrEqual(SWING_TIME);
      expect(t).toBeLessThan(5);
      const path = predict(world, sim, 2).path;
      const i = Math.round((t - 3) / STEP);
      expect(serveMiss(me, path[i]!)).toBeLessThan(0.02);
      // On its way down: an overarm toss passes the height too soon going up.
      expect(path[i + 1]!.y).toBeLessThan(path[i]!.y);
    },
  );
});

/**
 * Plays AI against AI for `seconds` from the start of a match, calling `see`
 * with each player's view, input and memory every step.
 */
function watch(
  presets: Readonly<Record<string, AiPreset>>,
  seed: number,
  seconds: number,
  see: (view: ReturnType<typeof viewOf>, input: InputState, memory: AiMemory) => void,
) {
  const random = seeded(seed);
  let s = startPlay(world, config, random, labels).state;
  let memory: Record<string, AiMemory> = { a: FRESH, b: FRESH };
  while (s.phase !== "over" && s.sim.time < seconds) {
    const inputs: Record<string, InputState> = {};
    for (const id of ["a", "b"]) {
      const view = viewOf(s, id);
      const r = aiInput(world, view, presets[id]!, memory[id]!, random, playerCapsule(view.me));
      see(view, r.input, r.memory);
      memory = { ...memory, [id]: r.memory };
      inputs[id] = r.input;
    }
    s = playStep(world, s, inputs).state;
  }
}

describe("the AI's input", () => {
  // The widest aim spread, so unclamped aims would often go past length 1.
  const wild = { ...AI_PRESETS.easy, aim: 2 };
  const pairs = [
    { a: AI_PRESETS.hard, b: AI_PRESETS.medium },
    { a: AI_PRESETS.easy, b: wild },
    { a: wild, b: AI_PRESETS.hard },
  ];

  it.each([1, 2, 3, 4, 5, 6])("never moves faster than a human can (seed %i)", (seed) => {
    let longest = 0;
    watch(pairs[seed % pairs.length]!, seed, 40, (_, input) => {
      longest = Math.max(longest, Math.hypot(input.move.x, input.move.y));
    });
    expect(longest).toBeGreaterThan(0.5);
    expect(longest).toBeLessThanOrEqual(1 + 1e-12);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    "never plans a contact it can't swing at in time (seed %i)",
    (seed) => {
      // With perfect timing, a plan swings exactly SWING_TIME before its contact.
      const exact = (p: AiPreset) => ({ ...p, timing: 0 });
      const pair = pairs[seed % pairs.length]!;
      const presets = { a: exact(pair.a), b: exact(pair.b) };
      let plans = 0;
      const last: Record<string, unknown> = {};
      watch(presets, seed, 40, (view, _, memory) => {
        const plan = memory.plan;
        if (plan === last[view.me.id]) return;
        last[view.me.id] = plan;
        if (plan?.swingAt == null) return;
        plans++;
        expect(plan.swingAt).toBeGreaterThanOrEqual(view.sim.time - 1e-9);
      });
      expect(plans).toBeGreaterThan(3);
    },
  );
});

import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { IDLE, type InputState } from "../input/input.ts";
import { secondGalleryLineZ } from "../player/serve.ts";
import { startRally } from "../rules/rally.ts";
import { SWING_TIME } from "../player/timing.ts";
import type { SimEvent } from "../sim/events.ts";
import { vec, ZERO, type Vec3 } from "../sim/vec.ts";
import { createWorld, initialState, STEP } from "../sim/world.ts";
import {
  changeEnds,
  feedDrop,
  feedMachine,
  initialPractice,
  practiceStep,
  startServe,
  type PracticeState,
} from "./practice.ts";
import { autoContact, idealContact, rightX, type Notice } from "./player.ts";

const world = createWorld(court);
const hl = court.floor.length / 2;
const swing: InputState = { ...IDLE, swing: true };

/** Runs for `seconds`, pressing `input` on the first step only. */
function run(state: PracticeState, seconds: number, input: InputState = IDLE, autoHit = false) {
  const events: SimEvent[] = [];
  const notices: Notice[] = [];
  const calls: string[] = [];
  let s = state;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const r = practiceStep(
      world,
      s,
      i === 0 ? input : { ...input, swing: false, select: null },
      autoHit,
    );
    s = r.state;
    events.push(...r.events);
    notices.push(...r.notices);
    calls.push(...r.calls.map((c) => c.id));
  }
  return { state: s, events, notices, calls };
}

/** Seconds until the ball is best placed for a forehand. */
function bestMoment(state: PracticeState): number {
  let s = state;
  let best = { d: Infinity, t: 0 };
  for (let i = 0; i < 400; i++) {
    s = practiceStep(world, s, IDLE).state;
    const c = idealContact(s.motion, s.end, false);
    const b = s.sim.ball.position;
    const d = Math.hypot(b.x - c.x, b.z - c.z) + Math.max(0, 0.2 - b.y, b.y - 1.8);
    if (d < best.d) best = { d, t: (i + 1) * STEP };
  }
  return best.t;
}

/** Waits, then swings so contact comes `early` seconds before the best moment. */
function swingAt(state: PracticeState, early: number, input: InputState = IDLE) {
  const wait = bestMoment(state) - SWING_TIME - early;
  const before = run(state, wait);
  return run(before.state, SWING_TIME + 3, { ...input, swing: true });
}

const fed = feedDrop(court, initialPractice(world));

describe("hitting", () => {
  it("hits a well-timed drop feed perfectly to the far end", () => {
    const { notices, events } = swingAt(fed, 0);
    expect(notices[0]).toMatchObject({ type: "shot", shot: "cut", timing: { grade: "perfect" } });
    expect(events[0]).toMatchObject({ type: "racketHit", player: "human" });
    const first = events.find((e) => e.type === "floorBounce")!;
    expect(first.position.z).toBeGreaterThan(hl - 5);
  });

  it("grades a mistimed swing, and whiffs a hopeless one", () => {
    expect(swingAt(fed, 0.07).notices[0]).toMatchObject({ timing: { grade: "good" } });
    expect(swingAt(fed, -0.12).notices[0]).toMatchObject({ timing: { grade: "poor" } });
    expect(swingAt(fed, 0.5).notices[0]).toEqual({ type: "whiff" });
  });

  it("takes shot and serve choices from the number keys", () => {
    const lob = run(fed, STEP, { ...IDLE, select: 3 }).state;
    expect(lob.shot).toBe("lob");
    const serving = run(startServe(court, fed), STEP, { ...IDLE, select: 7 }).state;
    expect(serving).toMatchObject({ serveStyle: 6, shot: "cut" });
  });
});

describe("serving", () => {
  const ready = startServe(court, initialPractice(world));

  function serve(state: PracticeState) {
    const tossed = run(state, STEP, swing).state;
    return swingAt(tossed, 0);
  }

  it("serves a good Railroad on to the Service Penthouse", () => {
    const { notices, events, calls, state } = serve(ready);
    expect(notices[0]).toMatchObject({ type: "shot", shot: "Railroad" });
    expect(events.map((e) => e.surface)).toContain("penthouse:service");
    // Unreturned, it Falls in the Service Court (Law 11.1(b)).
    expect([...calls, ...run(state, 4).calls]).toEqual(["goodService", "beyondServiceLine"]);
  });

  it("faults a server on the Second Gallery line", () => {
    const z = secondGalleryLineZ(court);
    const over = { ...ready, motion: { ...ready.motion, position: { x: 2, z } } };
    const served = serve(over);
    expect(served.notices).toContainEqual({ type: "serverFault", reason: "line" });
    expect(served.calls).toEqual(["faultLine"]);
  });

  it("faults a server who misses the ball", () => {
    const { notices, calls } = run(ready, 2, swing);
    expect(notices).toContainEqual({ type: "serverFault", reason: "missed" });
    expect(calls).toEqual(["faultMissed"]);
  });
});

describe("auto-hit (130, 131)", () => {
  /** The player at `pz`, with a ball coming from `from` at `velocity`. */
  const setup = (pz: number, from: Vec3, velocity: Vec3): PracticeState => ({
    ...initialPractice(world),
    motion: { position: { x: 0, z: pz }, velocity: { x: 0, z: 0 } },
    sim: initialState({ position: from, velocity, spin: ZERO }, 0),
  });
  // Angled into the back corner: out of reach on the way in, across the player on the way out.
  const deep = setup(-hl + 2, vec(-3.5, 1.2, -hl + 6), vec(5, 1, -12));
  // Straight at the player's body.
  const straight = setup(-hl + 4, vec(0, 1, -2), vec(0, 1, -15));

  it("hits a back-wall rebound without a swing", () => {
    const { events, notices } = run(deep, 3, IDLE, true);
    const wall = events.findIndex((e) => e.type === "wallHit");
    const hits = events.filter((e) => e.type === "racketHit");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ player: "human" });
    expect(events.indexOf(hits[0]!)).toBeGreaterThan(wall);
    expect(wall).toBeGreaterThanOrEqual(0);
    expect(notices[0]).toMatchObject({ type: "shot", shot: "cut", timing: { grade: "perfect" } });
  });

  it("hits a ball coming straight at the body, instead of taking it on the body", () => {
    const types = run(straight, 2, IDLE, true).events.map((e) => e.type);
    expect(types).toContain("racketHit");
    expect(types).not.toContain("playerHit");
  });

  it("leaves the ball alone when it's off", () => {
    expect(run(deep, 3).events.some((e) => e.type === "racketHit")).toBe(false);
    expect(run(straight, 2).events.map((e) => e.type)).toContain("playerHit");
  });

  it("grades by how near the ball is to the body, never worse than good", () => {
    const { x, z } = fed.motion.position;
    const right = rightX(fed.end);
    const at = (side: number, y = 1) => ({
      ...fed.sim,
      ball: { position: vec(x + right * side, y, z), velocity: ZERO, spin: ZERO },
    });
    expect(autoContact(fed, at(0))).toMatchObject({
      backhand: false,
      timing: { grade: "perfect" },
    });
    expect(autoContact(fed, at(0.6))).toMatchObject({ timing: { grade: "perfect" } });
    expect(autoContact(fed, at(-0.6))).toMatchObject({ backhand: true });
    expect(autoContact(fed, at(1.2))?.timing.grade).toBe("good");
    expect(autoContact(fed, at(1.3))).toBeNull();
    // Low skidders and high rebounds count.
    expect(autoContact(fed, at(0.6, 0.12))).not.toBeNull();
    expect(autoContact(fed, at(0.6, 2.15))).not.toBeNull();
  });

  it("never touches the player's own shot, a serve, or a swing in progress", () => {
    const c = idealContact(fed.motion, fed.end, false);
    const sim = { ...fed.sim, ball: { position: c, velocity: ZERO, spin: ZERO }, lastHitTime: 4 };
    expect(autoContact({ ...fed, struck: 3 }, sim)).not.toBeNull();
    expect(autoContact({ ...fed, struck: 4 }, sim)).toBeNull();
    expect(autoContact({ ...fed, serve: "tossed" }, sim)).toBeNull();
    const swinging = run(fed, STEP, swing).state;
    expect(autoContact(swinging, sim)).toBeNull();
  });

  describe("never strikes a ball it would lose on (231)", () => {
    // A hazard-end player by the net, the ball beside them on the far side.
    const near = { ...fed, id: "r", end: "hazard" as const, rally: null };
    near.motion = { position: { x: 0, z: 0.6 }, velocity: { x: 0, z: 0 } };
    const sim = { ...fed.sim, ball: { position: vec(0.05, 1, -0.3), velocity: ZERO, spin: ZERO } };
    const rest = startRally({ court, server: "s", receiver: "r", playingFor: null }, "s");

    it("not before it has crossed the net (Law 11.2(g))", () => {
      expect(autoContact(near, sim)).toBeNull();
      expect(autoContact(near, sim, rest)).toBeNull();
      // On this side, it's played.
      const over = { ...sim, ball: { ...sim.ball, position: vec(0.05, 1, 0.3) } };
      expect(autoContact(near, over, { ...rest, crossed: true })).not.toBeNull();
    });

    it("but still after it dropped on this side and came back", () => {
      const back = { ...rest, crossed: true, cameBack: true, drop: "hazard" as const };
      expect(autoContact(near, sim, back)).not.toBeNull();
    });
  });

  it("still needs a swing to serve", () => {
    const tossed = run(startServe(court, initialPractice(world)), STEP, swing).state;
    const { notices } = run(tossed, 2, IDLE, true);
    expect(notices).toContainEqual({ type: "serverFault", reason: "missed" });
  });
});

describe("practice", () => {
  it("calls the player's shot off a feed", () => {
    // A perfect cut to the far end, unreturned by the machine.
    const { state, calls } = swingAt(fed, 0);
    expect(state.rally?.striker).toBe("human");
    expect(calls).toHaveLength(1);
    expect(state.rally?.outcome?.kind).toMatch(/point|chase/);
  });

  it("judges an unreturned machine feed as a chase on the player's side", () => {
    let seed = 3;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const { state } = run(feedMachine(world, fed, random), 4);
    expect(state.rally?.outcome).toMatchObject({
      kind: "chase",
      call: { mark: { side: "service" } },
    });
  });

  it("feeds from the machine to land near the player", () => {
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const s = feedMachine(world, fed, random);
    const bounce = run(s, 3).events.find((e) => e.type === "floorBounce")!;
    const p = s.motion.position;
    expect(Math.abs(bounce.position.x - p.x)).toBeLessThan(2);
    expect(bounce.position.z).toBeGreaterThan(p.z);
    expect(bounce.position.z).toBeLessThan(p.z + 4);
  });

  it("feeds over the net every time", () => {
    for (let seed = 1; seed < 40; seed++) {
      const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const { events } = run(feedMachine(world, fed, random), 3);
      expect(events.some((e) => e.type === "netHit")).toBe(false);
      expect(events.find((e) => e.type === "floorBounce")!.position.z).toBeLessThan(0);
    }
  });

  it("changes ends", () => {
    const s = changeEnds(court, fed);
    expect(s.end).toBe("hazard");
    expect(s.motion.position.z).toBeCloseTo(-fed.motion.position.z);
  });
});

import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { IDLE, type InputState } from "../input/input.ts";
import { secondGalleryLineZ } from "../player/serve.ts";
import { SWING_TIME } from "../player/timing.ts";
import type { SimEvent } from "../sim/events.ts";
import { createWorld, STEP } from "../sim/world.ts";
import {
  changeEnds,
  feedDrop,
  feedMachine,
  idealContact,
  initialPractice,
  practiceStep,
  startServe,
  type Notice,
  type PracticeState,
} from "./practice.ts";

const world = createWorld(court);
const hl = court.floor.length / 2;
const swing: InputState = { ...IDLE, swing: true };

/** Runs for `seconds`, pressing `input` on the first step only. */
function run(state: PracticeState, seconds: number, input: InputState = IDLE) {
  const events: SimEvent[] = [];
  const notices: Notice[] = [];
  let s = state;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const r = practiceStep(world, s, i === 0 ? input : { ...input, swing: false, select: null });
    s = r.state;
    events.push(...r.events);
    notices.push(...r.notices);
  }
  return { state: s, events, notices };
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

const fed = feedDrop(initialPractice(world));

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
    const { notices, events } = serve(ready);
    expect(notices[0]).toMatchObject({ type: "shot", shot: "Railroad" });
    expect(events.map((e) => e.surface)).toContain("penthouse:service");
  });

  it("faults a server on the Second Gallery line", () => {
    const z = secondGalleryLineZ(court);
    const over = { ...ready, motion: { ...ready.motion, position: { x: 2, z } } };
    expect(serve(over).notices).toContainEqual({ type: "serverFault", reason: "line" });
  });

  it("faults a server who misses the ball", () => {
    const { notices } = run(ready, 2, swing);
    expect(notices).toContainEqual({ type: "serverFault", reason: "missed" });
  });
});

describe("practice", () => {
  it("feeds from the machine to land near the player", () => {
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const s = feedMachine(world, fed, random);
    const bounce = run(s, 3).events.find((e) => e.type === "floorBounce")!;
    const p = s.motion.position;
    expect(Math.abs(bounce.position.x - p.x)).toBeLessThan(2);
    expect(bounce.position.z).toBeGreaterThan(p.z);
    expect(bounce.position.z).toBeLessThan(p.z + 6);
  });

  it("changes ends", () => {
    const s = changeEnds(court, fed);
    expect(s.end).toBe("hazard");
    expect(s.motion.position.z).toBeCloseTo(-fed.motion.position.z);
  });
});

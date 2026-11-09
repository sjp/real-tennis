import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { IDLE, type InputState } from "../input/input.ts";
import {
  handPosition,
  secondGalleryLineZ,
  SERVE_STYLES,
  serveSpot,
  toss,
} from "../player/serve.ts";
import { SWING_TIME } from "../player/timing.ts";
import type { SimEvent } from "../sim/events.ts";
import { vec, ZERO, type Vec3 } from "../sim/vec.ts";
import { createWorld, initialState, STEP } from "../sim/world.ts";
import {
  act,
  afterStep,
  FOLLOW_THROUGH,
  held,
  idealContact,
  timeSwing,
  type Athlete,
  type Swinging,
} from "./player.ts";

const world = createWorld(court);
const at = { x: 1, z: -8 };
const athlete: Athlete = {
  id: "a",
  motion: { position: at, velocity: { x: 0, z: 0 } },
  end: "service",
  shot: "cut",
  serveStyle: 0,
  swing: null,
  serve: null,
  struck: null,
};
const server: Athlete = { ...athlete, motion: { ...athlete.motion, position: serveSpot(court) } };
const still = held(vec(0, world.ball.radius, 5), 3);

/** The step at which a swing started at 0 meets the ball. */
const CONTACT = Math.round(SWING_TIME / STEP);
const FAR = vec(0, 1, 5);

/** A swing pressed at 0 whose predicted ball reaches `p` on step `i`, and is far off otherwise. */
const swingThrough = (p: Vec3, i: number, serve = false): Swinging => ({
  start: 0,
  path: Array.from({ length: CONTACT + 20 }, (_, j) => (j === i ? p : FAR)),
  backhand: false,
  contact: false,
  serve,
});

describe("timeSwing", () => {
  const forehand = idealContact(athlete.motion, "service", false);
  const backhand = idealContact(athlete.motion, "service", true);

  it("is perfect when the ball reaches the ideal point as the racket does", () => {
    expect(timeSwing(athlete, swingThrough(forehand, CONTACT))).toMatchObject({
      timing: { grade: "perfect", error: 0 },
      backhand: false,
    });
  });

  it("plays a backhand when the ball comes on the other side", () => {
    expect(timeSwing(athlete, swingThrough(backhand, CONTACT))?.backhand).toBe(true);
  });

  it("calls a swing early when the ball arrives after the racket, and late before", () => {
    const early = timeSwing(athlete, swingThrough(forehand, CONTACT + 8))!.timing;
    const late = timeSwing(athlete, swingThrough(forehand, CONTACT - 8))!.timing;
    expect(early.error).toBeCloseTo(8 * STEP);
    expect(late.error).toBeCloseTo(-8 * STEP);
    expect(early.grade).toBe("good");
  });

  it("is null when the ball never comes within reach", () => {
    expect(timeSwing(athlete, swingThrough(FAR, CONTACT))).toBeNull();
  });

  it("times a serve against the serving hand, always as a forehand", () => {
    const tossed: Athlete = { ...server, serve: "tossed" };
    const style = SERVE_STYLES[0]!;
    const hand = handPosition(server.motion.position, "service", style.contactHeight);
    expect(timeSwing(tossed, swingThrough(hand, CONTACT, true))).toMatchObject({
      timing: { grade: "perfect" },
      backhand: false,
    });
    // Where a groundstroke would be perfect, a serve can't be reached.
    const ground = idealContact(server.motion, "service", false);
    expect(timeSwing(tossed, swingThrough(ground, CONTACT, true))).toBeNull();
  });
});

describe("act", () => {
  const input = (i: Partial<InputState>): InputState => ({ ...IDLE, ...i });

  it("picks a shot, or a serve style when serving", () => {
    expect(act(world, athlete, still, input({ select: 3 })).athlete.shot).toBe("lob");
    const ready: Athlete = { ...server, serve: "ready" };
    expect(act(world, ready, still, input({ select: 8 })).athlete.serveStyle).toBe(7);
  });

  it.each([0, 5, 9, -1])("ignores an out-of-range pick, %i, for a shot", (n) => {
    expect(act(world, athlete, still, input({ select: n })).athlete.shot).toBe("cut");
  });

  it.each([0, 9, -1])("ignores an out-of-range pick, %i, for a serve", (n) => {
    const ready: Athlete = { ...server, serve: "ready" };
    expect(act(world, ready, still, input({ select: n })).athlete.serveStyle).toBe(0);
  });

  it("tosses the ball for the first swing press when serving", () => {
    const ready: Athlete = { ...server, serve: "ready" };
    const r = act(world, ready, still, input({ swing: true }));
    expect(r.athlete).toMatchObject({ serve: "tossed", swing: null });
    const style = SERVE_STYLES[0]!;
    expect(r.sim.ball).toEqual(toss(style, server.motion.position, "service", world.ball.gravity));
    expect(r.sim).toMatchObject({ live: true, time: still.time });
  });

  it("keeps the ball in a ready server's hand", () => {
    const ready: Athlete = { ...server, serve: "ready" };
    const r = act(world, ready, still, IDLE);
    expect(r.sim.ball.position).not.toEqual(still.ball.position);
    expect(r.sim).toMatchObject({ live: false, asleep: true });
  });

  it("starts a swing, with the ball's predicted path, then ends it after the follow-through", () => {
    const flying = initialState({ position: vec(0, 2, 0), velocity: vec(0, 2, -8), spin: ZERO }, 3);
    const r = act(world, athlete, flying, input({ swing: true }));
    expect(r.athlete.swing).toMatchObject({ start: 3, contact: false, serve: false });
    expect(r.athlete.swing!.path.length).toBeGreaterThan(CONTACT);
    expect(r.events).toEqual([]);

    const done: Athlete = {
      ...athlete,
      swing: { start: 0, path: [], backhand: false, contact: true, serve: false },
    };
    const end = SWING_TIME + FOLLOW_THROUGH;
    expect(act(world, done, held(FAR, end - STEP), IDLE).athlete.swing).not.toBeNull();
    expect(act(world, done, held(FAR, end), IDLE).athlete.swing).toBeNull();
  });

  /** Serves from `z`, with the tossed ball meeting the racket perfectly this step. */
  function serveFrom(z: number) {
    const position = { x: serveSpot(court).x, z };
    const a: Athlete = {
      ...server,
      motion: { position, velocity: { x: 0, z: 0 } },
      serve: "tossed",
    };
    const hand = handPosition(position, "service", SERVE_STYLES[0]!.contactHeight);
    const swing = { ...swingThrough(hand, CONTACT, true), start: 3 - SWING_TIME };
    const ball = initialState({ position: hand, velocity: vec(0, -1, 0), spin: ZERO }, 3);
    return act(world, { ...a, swing }, ball, IDLE);
  }

  it("serves a tossed ball that the swing meets", () => {
    const r = serveFrom(serveSpot(court).z);
    expect(r.judged.map((e) => e.type)).toEqual(["racketHit"]);
    expect(r.athlete).toMatchObject({ serve: null, struck: 3 });
    expect(r.notices).toMatchObject([{ type: "shot", shot: "Railroad" }]);
  });

  it("judges the server over the line before the stroke (Law 8.1(d)(i))", () => {
    const r = serveFrom(secondGalleryLineZ(court) + 0.5);
    expect(r.judged[0]).toEqual({ type: "serverFault", reason: "line" });
    expect(r.judged[1]?.type).toBe("racketHit");
    expect(r.notices[0]).toEqual({ type: "serverFault", reason: "line" });
  });
});

describe("afterStep", () => {
  const bounce: SimEvent = {
    type: "floorBounce",
    time: 1,
    position: vec(0, 0.03, -8),
    bounce: 1,
    surface: "floor",
  };

  it("faults a tossed ball that reaches the floor (Law 8.1(d)(ii))", () => {
    const tossed: Athlete = { ...server, serve: "tossed" };
    expect(afterStep(tossed, [bounce])).toEqual({
      athlete: { ...tossed, serve: null },
      fault: true,
    });
    expect(afterStep(tossed, [])).toEqual({ athlete: tossed, fault: false });
  });

  it("leaves anyone not holding a tossed ball alone", () => {
    expect(afterStep(athlete, [bounce])).toEqual({ athlete, fault: false });
    const ready: Athlete = { ...server, serve: "ready" };
    expect(afterStep(ready, [bounce]).fault).toBe(false);
  });
});

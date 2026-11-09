import type { Side } from "../court/types.ts";
import { SHOT_TYPES, type InputState, type ShotType } from "../input/input.ts";
import { forwardZ, move, standardPlayer, type Motion } from "../player/movement.ts";
import { handPosition, overServiceLine, planServe, SERVE_STYLES, toss } from "../player/serve.ts";
import { planShot } from "../player/shot.ts";
import { GOOD, grade, PERFECT, POOR, SWING_TIME, type Timing } from "../player/timing.ts";
import type { RallyInput } from "../rules/rally.ts";
import type { SimEvent } from "../sim/events.ts";
import { hit } from "../sim/racket.ts";
import { madd, vec, ZERO, type Vec3 } from "../sim/vec.ts";
import {
  initialState,
  predict,
  STEP,
  type PlayerCapsule,
  type SimState,
  type World,
} from "../sim/world.ts";

const params = standardPlayer;

/** How long the follow-through lasts after contact. */
export const FOLLOW_THROUGH = 0.2;
/** The ideal contact point: out to the side and a little ahead. ⚠ verify */
export const SIDE_REACH = 0.7;
const AHEAD = 0.3;
/** Comfortable hitting heights for a groundstroke or volley. */
export const LOW = 0.2;
export const HIGH = 1.8;
/** How far the ball can be from the ideal point and still be timed. */
const REACH = 0.8;
/** How far it can be at contact, after a mistimed swing, and still be hit. */
const STRETCH = 1.5;
/** How close the ball must come to the body to be hit automatically (131). */
export const AUTO_REACH = 1.25;
/** Closer than this, the ball is about to hit the body, so it's struck now. */
const AUTO_BODY = 0.6;
/** The heights an auto-hit takes the ball at: wider than a timed swing's. */
const AUTO_LOW = 0.1;
const AUTO_HIGH = 2.2;

export interface Swinging {
  /** When swing was pressed. Contact is SWING_TIME later. */
  readonly start: number;
  /** The ball's predicted position after each step from `start`. */
  readonly path: readonly Vec3[];
  /** Set at contact: which side, and how it went. */
  readonly backhand: boolean;
  readonly contact: boolean;
  /** Swung at a tossed ball: a serve. */
  readonly serve: boolean;
}

/** One player on court: where they are, and what they're doing with the racket. */
export interface Athlete {
  readonly id: string;
  readonly motion: Motion;
  readonly end: Side;
  readonly shot: ShotType;
  /** Index into SERVE_STYLES. */
  readonly serveStyle: number;
  readonly swing: Swinging | null;
  /** Null when not serving; otherwise whether the ball is tossed yet. */
  readonly serve: "ready" | "tossed" | null;
  /** When this athlete last struck the ball, so auto-hit leaves their own shot alone. */
  readonly struck: number | null;
}

/** Things the game reports beyond the physics, for the HUD and 050. */
export type Notice =
  // `shot` is a ShotType, or the serve style's name.
  | { readonly type: "shot"; readonly shot: string; readonly timing: Timing }
  | { readonly type: "whiff" }
  /**
   * A server fault for 050 to consume: on or over the Second Gallery line
   * (Law 8.1(d)(i)), or missing the ball (Law 8.1(d)(ii)).
   */
  | { readonly type: "serverFault"; readonly reason: "line" | "missed" };

/** A ball held still at `at`, e.g. out of the way or in the server's hand. */
export function held(at: Vec3, time: number): SimState {
  return {
    ...initialState({ position: at, velocity: ZERO, spin: ZERO }, time),
    live: false,
    asleep: true,
  };
}

/** The ball in a ready server's hand, before the toss. */
export function inHand(world: World, a: Athlete, time: number): SimState {
  const style = SERVE_STYLES[a.serveStyle]!;
  return held(toss(style, a.motion.position, a.end, world.ball.gravity).position, time);
}

export function playerCapsule(a: Athlete): PlayerCapsule {
  const { x, z } = a.motion.position;
  return { id: a.id, a: vec(x, 0.3, z), b: vec(x, params.height - 0.3, z), radius: 0.25 };
}

/** The striker's right, facing down the court. */
export const rightX = (end: Side) => -forwardZ(end);

/** Where the racket would ideally meet the ball, on either side. */
export function idealContact(m: Motion, end: Side, backhand: boolean): Vec3 {
  const side = (backhand ? -1 : 1) * rightX(end) * SIDE_REACH;
  return vec(m.position.x + side, 1, m.position.z + forwardZ(end) * AHEAD);
}

/** How far a ball at `b` is from being nicely in reach on one side. */
function miss(m: Motion, end: Side, backhand: boolean, b: Vec3): number {
  const c = idealContact(m, end, backhand);
  const height = Math.max(0, LOW - b.y, b.y - HIGH);
  return Math.hypot(b.x - c.x, b.z - c.z) + height;
}

/** How far a tossed ball at `b` is from the serving contact point. */
export function serveMiss(a: Athlete, b: Vec3): number {
  const style = SERVE_STYLES[a.serveStyle]!;
  const c = handPosition(a.motion.position, a.end, style.contactHeight);
  return Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z);
}

/**
 * Times a swing: when the ball was best placed, against when the racket got
 * there. Returns null if the ball never came within reach.
 */
export function timeSwing(
  a: Athlete,
  swing: Swinging,
): { readonly timing: Timing; readonly backhand: boolean } | null {
  const contact = swing.start + SWING_TIME;
  const serving = a.serve === "tossed";
  let best = { cost: Infinity, time: 0, backhand: false };
  swing.path.forEach((b, i) => {
    const time = swing.start + i * STEP;
    if (serving) {
      const cost = serveMiss(a, b);
      if (cost < best.cost) best = { cost, time, backhand: false };
      return;
    }
    for (const backhand of [false, true]) {
      const cost = miss(a.motion, a.end, backhand, b);
      if (cost < best.cost) best = { cost, time, backhand };
    }
  });
  if (best.cost > REACH) return null;
  return { timing: grade(best.time - contact, best.backhand), backhand: best.backhand };
}

/** Ball positions over the swing and a little beyond, for timing it. */
function swingPath(world: World, sim: SimState): readonly Vec3[] {
  return predict(world, sim, SWING_TIME + POOR + 0.05).path;
}

function select(a: Athlete, n: number | null): Athlete {
  if (n === null) return a;
  if (a.serve !== null) return n <= SERVE_STYLES.length ? { ...a, serveStyle: n - 1 } : a;
  return n <= SHOT_TYPES.length ? { ...a, shot: SHOT_TYPES[n - 1]! } : a;
}

export interface Action {
  readonly athlete: Athlete;
  readonly sim: SimState;
  readonly events: readonly SimEvent[];
  readonly notices: readonly Notice[];
  /** What the rules engine sees, in order. */
  readonly judged: readonly RallyInput[];
}

/**
 * Whether to strike the ball automatically this step (130, 131). Rally balls
 * only: never a serve, never the athlete's own shot, and not during a manual
 * swing. It fires when the ball is within AUTO_REACH of the body, at its
 * closest approach, or straight away if it's about to hit the body.
 */
export function autoContact(
  a: Athlete,
  sim: SimState,
): { readonly timing: Timing; readonly backhand: boolean } | null {
  if (a.swing !== null || a.serve !== null) return null;
  if (!sim.live || sim.asleep || sim.captured !== null || sim.lastHitTime === a.struck) return null;
  const b = sim.ball.position;
  const d = nearness(a.motion, b);
  if (d > AUTO_REACH) return null;
  const next = nearness(a.motion, madd(b, sim.ball.velocity, STEP));
  if (next < d && next > AUTO_BODY) return null;
  const { x, z } = a.motion.position;
  // Whichever side of the body it's on; dead centre is a forehand.
  const backhand = (b.x - x) * rightX(a.end) < 0;
  // Perfect in the inner half, easing to the edge of "good" at full reach.
  const inner = AUTO_REACH / 2;
  const late = Math.max(0, d - inner) / (AUTO_REACH - inner);
  const ahead = (b.z - z) * forwardZ(a.end) >= 0 ? 1 : -1;
  const error = d <= inner ? 0 : ahead * (PERFECT + late * (GOOD - PERFECT));
  return { timing: grade(error, backhand), backhand };
}

/** How far a ball at `b` is from the body's axis, plus how far outside the auto-hit heights. */
function nearness(m: Motion, b: Vec3): number {
  const height = Math.max(0, AUTO_LOW - b.y, b.y - AUTO_HIGH);
  return Math.hypot(b.x - m.position.x, b.z - m.position.z) + height;
}

/**
 * A player's part of one fixed step, before the ball moves: choosing, tossing,
 * swinging, running, and striking the ball if the swing meets it. With
 * `autoHit`, a rally ball that comes into reach is struck without a swing.
 */
export function act(
  world: World,
  athlete: Athlete,
  sim: SimState,
  input: InputState,
  autoHit = false,
): Action {
  const notices: Notice[] = [];
  const judged: RallyInput[] = [];
  const events: SimEvent[] = [];
  let a = select(athlete, input.select);

  if (input.swing && a.serve === "ready") {
    const style = SERVE_STYLES[a.serveStyle]!;
    a = { ...a, serve: "tossed" };
    sim = initialState(toss(style, a.motion.position, a.end, world.ball.gravity), sim.time);
  } else if (input.swing && a.swing === null) {
    a = {
      ...a,
      swing: {
        start: sim.time,
        path: swingPath(world, sim),
        backhand: false,
        contact: false,
        serve: a.serve === "tossed",
      },
    };
  }

  a = { ...a, motion: move(world.court, params, a.motion, input, a.end, STEP) };

  const swing = a.swing;
  if (swing && !swing.contact && sim.time >= swing.start + SWING_TIME) {
    const timed = timeSwing(a, swing);
    const ball = sim.ball;
    const serving = a.serve === "tossed";
    const off = serving
      ? serveMiss(a, ball.position)
      : miss(a.motion, a.end, timed?.backhand ?? false, ball.position);
    const reachable =
      timed !== null && timed.timing.grade !== "miss" && !sim.captured && off <= STRETCH;
    a = { ...a, swing: { ...swing, contact: true, backhand: timed?.backhand ?? false } };
    if (!reachable) notices.push({ type: "whiff" });
    else {
      if (serving && overServiceLine(world.court, params, a.motion.position)) {
        notices.push({ type: "serverFault", reason: "line" });
        judged.push({ type: "serverFault", reason: "line" });
      }
      const racket = serving
        ? planServe(world, a.id, SERVE_STYLES[a.serveStyle]!, ball, a.end, input.move, timed.timing)
        : planShot(world, a.id, a.shot, ball, a.end, input.move, timed.timing).racket;
      const struck = hit(world.ball, sim, racket);
      events.push(...struck.events);
      judged.push(...struck.events);
      notices.push({
        type: "shot",
        shot: serving ? SERVE_STYLES[a.serveStyle]!.name : a.shot,
        timing: timed.timing,
      });
      sim = struck.state;
      a = { ...a, serve: null, struck: sim.time };
    }
  }

  const auto = autoHit ? autoContact(a, sim) : null;
  if (auto) {
    // Shown as a swing already at contact, so the follow-through plays.
    a = {
      ...a,
      swing: {
        start: sim.time - SWING_TIME,
        path: [],
        backhand: auto.backhand,
        contact: true,
        serve: false,
      },
    };
    const racket = planShot(world, a.id, a.shot, sim.ball, a.end, input.move, auto.timing).racket;
    const struck = hit(world.ball, sim, racket);
    events.push(...struck.events);
    judged.push(...struck.events);
    notices.push({ type: "shot", shot: a.shot, timing: auto.timing });
    sim = struck.state;
    a = { ...a, struck: sim.time };
  }
  if (a.swing && sim.time >= a.swing.start + SWING_TIME + FOLLOW_THROUGH) a = { ...a, swing: null };

  if (a.serve === "ready") sim = inHand(world, a, sim.time);
  return { athlete: a, sim, events, notices, judged };
}

/** After the ball moves: a tossed ball that reaches the floor is a missed service. */
export function afterStep(
  a: Athlete,
  events: readonly SimEvent[],
): { readonly athlete: Athlete; readonly fault: boolean } {
  if (a.serve !== "tossed" || !events.some((e) => e.type === "floorBounce"))
    return { athlete: a, fault: false };
  return { athlete: { ...a, serve: null }, fault: true };
}

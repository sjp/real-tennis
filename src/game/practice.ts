import type { CourtDefinition, Side } from "../court/types.ts";
import { SHOT_TYPES, type InputState, type ShotType } from "../input/input.ts";
import { clampToEnd, forwardZ, move, standardPlayer, type Motion } from "../player/movement.ts";
import {
  handPosition,
  overServiceLine,
  planServe,
  SERVE_STYLES,
  serveSpot,
  toss,
} from "../player/serve.ts";
import { aimAt, planShot } from "../player/shot.ts";
import {
  rally,
  startRally,
  type PlayerId,
  type RallyInput,
  type RallyState,
} from "../rules/rally.ts";
import type { TeachingEvent } from "../rules/teaching.ts";
import { grade, POOR, SWING_TIME, type Timing } from "../player/timing.ts";
import type { BallState } from "../sim/ball.ts";
import type { SimEvent } from "../sim/events.ts";
import { hit } from "../sim/racket.ts";
import { vec, ZERO, type Vec3 } from "../sim/vec.ts";
import {
  initialState,
  predict,
  step,
  STEP,
  type PlayerCapsule,
  type SimState,
  type World,
} from "../sim/world.ts";

export const PLAYER_ID = "human";
/** The ball machine, standing in for an opponent at the far end. */
export const MACHINE_ID = "machine";
const params = standardPlayer;

/** How long the follow-through lasts after contact. */
export const FOLLOW_THROUGH = 0.2;
/** The ideal contact point: out to the side and a little ahead. ⚠ verify */
const SIDE_REACH = 0.7;
const AHEAD = 0.3;
/** Comfortable hitting heights for a groundstroke or volley. */
const LOW = 0.2;
const HIGH = 1.8;
/** How far the ball can be from the ideal point and still be timed. */
const REACH = 0.8;
/** How far it can be at contact, after a mistimed swing, and still be hit. */
const STRETCH = 1.5;

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

export interface PracticeState {
  readonly sim: SimState;
  readonly motion: Motion;
  readonly end: Side;
  readonly shot: ShotType;
  /** Index into SERVE_STYLES. */
  readonly serveStyle: number;
  readonly swing: Swinging | null;
  /** Null when not serving; otherwise whether the ball is tossed yet. */
  readonly serve: "ready" | "tossed" | null;
  /** The rules engine's view of the ball in play, if it's a rest it can judge. */
  readonly rally: RallyState | null;
}

/** Things the game reports beyond the physics, for the HUD and 050. */
export type Notice =
  | { readonly type: "shot"; readonly shot: ShotType | string; readonly timing: Timing }
  | { readonly type: "whiff" }
  /**
   * A server fault for 050 to consume: on or over the Second Gallery line
   * (Law 8.1(d)(i)), or missing the ball (Law 8.1(d)(ii)).
   */
  | { readonly type: "serverFault"; readonly reason: "line" | "missed" };

export interface PracticeResult {
  readonly state: PracticeState;
  readonly events: readonly SimEvent[];
  readonly notices: readonly Notice[];
  /** The Marker's calls from the rules engine. */
  readonly calls: readonly TeachingEvent[];
}

/** A ball held still at `at`, e.g. out of the way or in the server's hand. */
function held(at: Vec3, time: number): SimState {
  return {
    ...initialState({ position: at, velocity: ZERO, spin: ZERO }, time),
    live: false,
    asleep: true,
  };
}

export function initialPractice(world: World): PracticeState {
  const court = world.court;
  return {
    // Resting by the net post until the first feed.
    sim: held(vec(court.floor.width / 2 - 0.5, world.ball.radius, 0.5), 0),
    motion: { position: { x: 0, z: -court.floor.length / 4 }, velocity: { x: 0, z: 0 } },
    end: "service",
    shot: "cut",
    serveStyle: 0,
    swing: null,
    serve: null,
    rally: null,
  };
}

/** A rest with the machine at the far end. `striker` starts one already struck. */
function practiceRally(
  court: CourtDefinition,
  end: Side,
  striker: PlayerId | null = null,
): RallyState {
  const human = end === "service";
  return startRally(
    {
      court,
      server: human ? PLAYER_ID : MACHINE_ID,
      receiver: human ? MACHINE_ID : PLAYER_ID,
      playingFor: null,
    },
    striker,
  );
}

export function playerCapsule(m: Motion): PlayerCapsule {
  const { x, z } = m.position;
  return { id: PLAYER_ID, a: vec(x, 0.3, z), b: vec(x, params.height - 0.3, z), radius: 0.25 };
}

/** The striker's right, facing down the court. */
const rightX = (end: Side) => -forwardZ(end);

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
function serveMiss(state: PracticeState, b: Vec3): number {
  const style = SERVE_STYLES[state.serveStyle]!;
  const c = handPosition(state.motion.position, state.end, style.contactHeight);
  return Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z);
}

/**
 * Times a swing: when the ball was best placed, against when the racket got
 * there. Returns null if the ball never came within reach.
 */
export function timeSwing(
  state: PracticeState,
  swing: Swinging,
): { readonly timing: Timing; readonly backhand: boolean } | null {
  const contact = swing.start + SWING_TIME;
  const serving = state.serve === "tossed";
  let best = { cost: Infinity, time: 0, backhand: false };
  swing.path.forEach((b, i) => {
    const time = swing.start + i * STEP;
    if (serving) {
      const cost = serveMiss(state, b);
      if (cost < best.cost) best = { cost, time, backhand: false };
      return;
    }
    for (const backhand of [false, true]) {
      const cost = miss(state.motion, state.end, backhand, b);
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

function select(state: PracticeState, n: number | null): PracticeState {
  if (n === null) return state;
  if (state.serve !== null)
    return n <= SERVE_STYLES.length ? { ...state, serveStyle: n - 1 } : state;
  return n <= SHOT_TYPES.length ? { ...state, shot: SHOT_TYPES[n - 1]! } : state;
}

/** One fixed step of solo practice. Pure: the same inputs give the same result. */
export function practiceStep(
  world: World,
  state: PracticeState,
  input: InputState,
): PracticeResult {
  const notices: Notice[] = [];
  /** What the rules engine sees, in order. */
  const judged: RallyInput[] = [];
  let s = select(state, input.select);

  if (input.swing && s.serve === "ready") {
    const style = SERVE_STYLES[s.serveStyle]!;
    s = {
      ...s,
      serve: "tossed",
      sim: initialState(toss(style, s.motion.position, s.end, world.ball.gravity), s.sim.time),
    };
  } else if (input.swing && s.swing === null) {
    s = {
      ...s,
      swing: {
        start: s.sim.time,
        path: swingPath(world, s.sim),
        backhand: false,
        contact: false,
        serve: s.serve === "tossed",
      },
    };
  }

  s = { ...s, motion: move(world.court, params, s.motion, input, s.end, STEP) };

  const events: SimEvent[] = [];
  const swing = s.swing;
  if (swing && !swing.contact && s.sim.time >= swing.start + SWING_TIME) {
    const timed = timeSwing(s, swing);
    const ball = s.sim.ball;
    const off =
      s.serve === "tossed"
        ? serveMiss(s, ball.position)
        : miss(s.motion, s.end, timed?.backhand ?? false, ball.position);
    const reachable =
      timed !== null && timed.timing.grade !== "miss" && !s.sim.captured && off <= STRETCH;
    s = { ...s, swing: { ...swing, contact: true, backhand: timed?.backhand ?? false } };
    if (!reachable) notices.push({ type: "whiff" });
    else {
      const serving = s.serve === "tossed";
      if (serving && overServiceLine(world.court, params, s.motion.position)) {
        notices.push({ type: "serverFault", reason: "line" });
        judged.push({ type: "serverFault", reason: "line" });
      }
      const racket = serving
        ? planServe(
            world,
            PLAYER_ID,
            SERVE_STYLES[s.serveStyle]!,
            ball,
            s.end,
            input.move,
            timed.timing,
          )
        : planShot(world, PLAYER_ID, s.shot, ball, s.end, input.move, timed.timing).racket;
      const struck = hit(world.ball, s.sim, racket);
      events.push(...struck.events);
      judged.push(...struck.events);
      notices.push({
        type: "shot",
        shot: serving ? SERVE_STYLES[s.serveStyle]!.name : s.shot,
        timing: timed.timing,
      });
      s = { ...s, sim: struck.state, serve: null };
    }
  }
  if (s.swing && s.sim.time >= s.swing.start + SWING_TIME + FOLLOW_THROUGH)
    s = { ...s, swing: null };

  if (s.serve === "ready") {
    const style = SERVE_STYLES[s.serveStyle]!;
    const hand = toss(style, s.motion.position, s.end, world.ball.gravity).position;
    s = { ...s, sim: held(hand, s.sim.time) };
  }

  const stepped = step(world, s.sim, [playerCapsule(s.motion)]);
  events.push(...stepped.events);
  judged.push(...stepped.events);
  s = { ...s, sim: stepped.state };
  if (s.serve === "tossed" && stepped.events.some((e) => e.type === "floorBounce")) {
    notices.push({ type: "serverFault", reason: "missed" });
    judged.push({ type: "serverFault", reason: "missed" });
    s = { ...s, serve: null };
  }

  const calls: TeachingEvent[] = [];
  let judging = s.rally;
  for (const e of judging ? judged : []) {
    const r = rally(judging!, e);
    judging = r.state;
    calls.push(...r.teaching);
  }
  return { state: { ...s, rally: judging }, events, notices, calls };
}

/**
 * Lobs a ball up just ahead of the player, coming back towards them, so it
 * bounces and rises through the forehand's hitting zone.
 */
export function feedDrop(court: CourtDefinition, state: PracticeState): PracticeState {
  const f = forwardZ(state.end);
  const { x, z } = state.motion.position;
  const ball: BallState = {
    position: vec(x + rightX(state.end) * SIDE_REACH, 1.3, z + f * 1.6),
    velocity: vec(0, 1, -f * 1.4),
    spin: ZERO,
  };
  // Judged as if the machine had sent it over the net.
  const fed = practiceRally(court, state.end, MACHINE_ID);
  const over = rally(fed, {
    type: "netCrossed",
    from: state.end === "service" ? "hazard" : "service",
    time: state.sim.time,
    position: ball.position,
    surface: "net",
  }).state;
  return { ...state, serve: null, rally: over, sim: initialState(ball, state.sim.time) };
}

/** The machine's feeds land at least this far from the net. */
const MACHINE_MIN_DEPTH = 5;

/**
 * A ball machine at the far end, landing a ball near the player with some
 * variety. `random` returns numbers in [0, 1).
 */
export function feedMachine(
  world: World,
  state: PracticeState,
  random: () => number,
): PracticeState {
  const f = forwardZ(state.end);
  const hl = world.court.floor.length / 2;
  const { x, z } = state.motion.position;
  const from = vec((random() - 0.5) * 4, 1.2, f * (hl - 1.5));
  // Bounce a little in front of the player, so it rises to them, but far
  // enough past the net that a fast feed can drop there.
  const fromNet = Math.max(MACHINE_MIN_DEPTH, -f * z - 1.5 - random() * 1.5);
  const target = vec(x + (random() - 0.5) * 3, world.ball.radius, -f * fromNet);
  // Travelling -f·z, spin about +f·x is backspin.
  const spin = vec(f * (40 + random() * 80), 0, 0);
  const velocity = aimAt(world.ball, from, target, spin, { speed: 17 + random() * 4 });
  return {
    ...state,
    serve: null,
    rally: practiceRally(world.court, state.end, MACHINE_ID),
    sim: initialState({ position: from, velocity, spin }, state.sim.time),
  };
}

/** Swaps the player to the other end, at the mirror of where they were. */
export function changeEnds(court: CourtDefinition, state: PracticeState): PracticeState {
  const end: Side = state.end === "service" ? "hazard" : "service";
  const { x, z } = state.motion.position;
  const position = clampToEnd(court, params, end, { x, z: -z });
  return {
    ...state,
    end,
    serve: null,
    rally: null,
    motion: { position, velocity: { x: 0, z: 0 } },
  };
}

/** Takes the player to the serving spot with a ball in hand. Serving is from the service end. */
export function startServe(court: CourtDefinition, state: PracticeState): PracticeState {
  return {
    ...state,
    end: "service",
    serve: "ready",
    swing: null,
    rally: practiceRally(court, "service"),
    motion: { position: serveSpot(court), velocity: { x: 0, z: 0 } },
  };
}

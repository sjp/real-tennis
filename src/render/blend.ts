import type { FloorPoint, Vec3 } from "../court/types.ts";
import type { Athlete } from "../game/player.ts";
import { STEP } from "../sim/world.ts";

/**
 * Drawing between physics steps (154). The loop keeps the state from before
 * the latest step in `prev`, and how far the frame is past that step, as a
 * fraction of a step, in `t`. The game itself only ever sees the stepped state.
 */
export interface Blend<S> {
  /** The state before the latest step. */
  prev(): S;
  /** How far to draw from `prev` towards the latest state, 0–1. */
  t(): number;
  /** Before each step: the state it starts from. */
  stepping(before: S): void;
  /** After the frame's steps: how far to draw past `prev`, 0–1. */
  at(t: number): void;
}

export function createBlend<S>(state: S): Blend<S> {
  let prev = state;
  let t = 1;
  return {
    prev: () => prev,
    t: () => t,
    stepping: (before) => {
      prev = before;
    },
    at: (k) => {
      t = k;
    },
  };
}

/**
 * The `useFrame` priority for the loops that step the sim. Negative, so they
 * run before everything that draws from the state in the same frame (default
 * priority 0); a positive priority would turn off R3F's own rendering.
 */
export const STEP_FIRST = -1;

/**
 * Further than a player moves in one step, in metres: 120 m/s against a
 * sprint of 6.5. A bigger move is a teleport (a rest set up, a reset).
 */
export const PLAYER_JUMP = 0.5;
/** Likewise for the ball: 240 m/s, faster than any shot. A bigger move is a feed or a reset. */
export const BALL_JUMP = 1;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Between two floor points, or `b` when they're too far apart to be one step's move. */
export function blendPoint(a: FloorPoint, b: FloorPoint, t: number, jump: number): FloorPoint {
  if (Math.hypot(b.x - a.x, b.z - a.z) > jump) return b;
  return { x: mix(a.x, b.x, t), z: mix(a.z, b.z, t) };
}

/** Between two points in space, or `b` when they're too far apart to be one step's move. */
export function blendVec(a: Vec3, b: Vec3, t: number, jump: number): Vec3 {
  if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > jump) return b;
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) };
}

/**
 * The sim clock between two steps; `b` when it didn't simply tick on (a reset,
 * or no step taken since).
 */
export function blendTime(a: number, b: number, t: number): number {
  const d = b - a;
  return d > 0 && d < 1.5 * STEP ? mix(a, b, t) : b;
}

/**
 * The athlete to draw: the latest one, moved back towards where it was before
 * the step. Snaps to the latest when the step changed ends or teleported it,
 * so nobody slides across the court.
 */
export function blendAthlete<A extends Athlete>(prev: Athlete | undefined, next: A, t: number): A {
  if (!prev || prev.end !== next.end || t >= 1) return next;
  const position = blendPoint(prev.motion.position, next.motion.position, t, PLAYER_JUMP);
  if (position === next.motion.position) return next;
  return { ...next, motion: { ...next.motion, position } };
}

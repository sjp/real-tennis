import type { Side } from "../court/types.ts";
import { forwardZ, standardPlayer, type Motion } from "../player/movement.ts";
import type { Vec3 } from "../sim/vec.ts";
import { STEP, type Prediction } from "../sim/world.ts";

/** How far the racket reaches from the body's centre. ⚠ verify */
const REACH = 0.7;
const LOW = 0.2;
const HIGH = 1.8;

export interface Assist {
  /** Where the ball next meets the floor. */
  readonly bounce: Vec3 | null;
  /** The first point the player can reach in time, at a comfortable height. */
  readonly intercept: Vec3 | null;
}

/**
 * The hit-assist rings, from a prediction of the ball starting now. Only
 * balls on the player's side of the net count for the intercept.
 */
export function assist(prediction: Prediction, motion: Motion, end: Side, now: number): Assist {
  const bounce = prediction.events.find((e) => e.type === "floorBounce" && e.time >= now);
  const start = prediction.state.time - (prediction.path.length - 1) * STEP;
  const f = forwardZ(end);
  const { x, z } = motion.position;
  let intercept: Vec3 | null = null;
  for (let i = 0; i < prediction.path.length && intercept === null; i++) {
    const t = start + i * STEP - now;
    const p = prediction.path[i]!;
    if (t < 0 || p.z * f > 0 || p.y < LOW || p.y > HIGH) continue;
    const gap = Math.hypot(p.x - x, p.z - z) - REACH;
    if (gap <= standardPlayer.runSpeed * t) intercept = p;
  }
  return { bounce: bounce?.position ?? null, intercept };
}

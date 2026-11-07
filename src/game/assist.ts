import type { Side } from "../court/types.ts";
import { forwardZ, standardPlayer, type Motion } from "../player/movement.ts";
import type { Vec3 } from "../sim/vec.ts";
import { predict, STEP, type Prediction, type SimState, type World } from "../sim/world.ts";

/** How far the racket reaches from the body's centre. ⚠ verify */
const REACH = 0.7;
const LOW = 0.2;
const HIGH = 1.8;
/** Seconds of ball flight the hit assist looks ahead. */
export const ASSIST_HORIZON = 3;
/** Seconds of flight added at a time as a kept prediction runs short. */
const TOP_UP = 0.25;

export interface Assist {
  /** Where the ball next meets the floor. */
  readonly bounce: Vec3 | null;
  /** The first point the player can reach in time, at a comfortable height. */
  readonly intercept: Vec3 | null;
}

/**
 * The hit-assist rings, from a prediction of the ball that covers now. Only
 * balls on the player's side of the net count for the intercept, and only
 * the next `horizon` seconds of the prediction are used.
 */
export function assist(
  prediction: Prediction,
  motion: Motion,
  end: Side,
  now: number,
  horizon = Infinity,
): Assist {
  const steps = Math.round(horizon / STEP);
  const until = now + steps * STEP + 1e-9;
  const bounce = prediction.events.find(
    (e) => e.type === "floorBounce" && e.time >= now && e.time <= until,
  );
  const start = prediction.start;
  // Counted in whole steps, so a kept prediction gives the same times as a fresh one.
  const first = Math.max(0, Math.ceil((now - start) / STEP - 1e-6));
  const last = Math.min(prediction.path.length - 1, first + steps);
  const f = forwardZ(end);
  const { x, z } = motion.position;
  let intercept: Vec3 | null = null;
  for (let i = first; i <= last && intercept === null; i++) {
    const t = (i - first) * STEP;
    const p = prediction.path[i]!;
    if (p.z * f > 0 || p.y < LOW || p.y > HIGH) continue;
    const gap = Math.hypot(p.x - x, p.z - z) - REACH;
    // The player always sprints (170).
    if (gap <= standardPlayer.sprintSpeed * t) intercept = p;
  }
  return { bounce: bounce?.position ?? null, intercept };
}

/** A prediction kept for the rings, and the course it was made for. */
export interface AssistPlan {
  readonly prediction: Prediction | null;
  readonly key: string;
}

export const NO_PLAN: AssistPlan = { prediction: null, key: "" };

/**
 * When the course has certainly changed: a racket hit, or a ball in hand.
 * Bounces are on the predicted path already, so they don't count; a ball
 * knocked off its path otherwise (a body, a reset) is caught by `stepOf`.
 */
function courseKey(sim: SimState): string {
  return [sim.lastHitTime, sim.asleep].join("|");
}

/** The step of `prediction` the sim is at now, or -1 if the ball has left that path. */
function stepOf(prediction: Prediction, sim: SimState): number {
  const { start } = prediction;
  const i = Math.round((sim.time - start) / STEP);
  if (i < 0 || i >= prediction.path.length) return -1;
  if (Math.abs(start + i * STEP - sim.time) > STEP / 4) return -1;
  const p = prediction.path[i]!;
  const b = sim.ball.position;
  return Math.max(Math.abs(p.x - b.x), Math.abs(p.y - b.y), Math.abs(p.z - b.z)) <= 1e-9 ? i : -1;
}

/**
 * The prediction to draw the rings from at `sim`. The ball's path doesn't
 * depend on the players, so it's kept while the ball follows it, and topped
 * up from its end state (the same steps a fresh prediction would take) as it
 * runs short of `horizon`. It's made afresh only when the course changes.
 */
export function planAssist(
  plan: AssistPlan,
  world: World,
  sim: SimState,
  horizon = ASSIST_HORIZON,
): AssistPlan {
  const key = courseKey(sim);
  if (sim.asleep) return { prediction: null, key };
  const kept = plan.prediction;
  const i = kept !== null && key === plan.key ? stepOf(kept, sim) : -1;
  if (kept === null || i < 0) return { prediction: predict(world, sim, horizon), key };
  const need = Math.round(horizon / STEP) - (kept.path.length - 1 - i);
  if (need <= 0 || kept.state.captured !== null || kept.state.asleep) return plan;
  const more = predict(world, kept.state, Math.max(need * STEP, TOP_UP));
  return {
    key,
    prediction: {
      start: sim.time,
      path: [...kept.path.slice(i), ...more.path.slice(1)],
      events: [...kept.events.filter((e) => e.time >= sim.time - STEP), ...more.events],
      state: more.state,
    },
  };
}

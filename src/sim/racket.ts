import type { BallParams, BallState } from "./ball.ts";
import { collide } from "./contact.ts";
import { dot, length, sub, type Vec3 } from "./vec.ts";
import type { SimState, StepResult } from "./world.ts";

export interface Racket {
  readonly player: string;
  /** Velocity of the strings at the impact point. */
  readonly velocity: Vec3;
  /**
   * Unit normal of the strings, facing the ball. Tilting it up opens the
   * face, which cuts under the ball and puts on backspin.
   */
  readonly normal: Vec3;
  /** 1 for the sweet spot, falling to 0 for a mishit. */
  readonly timing: number;
}

export interface RacketParams {
  /** Effective mass at the impact point. */
  readonly mass: number;
  readonly restitution: number;
  readonly friction: number;
}

/**
 * A real tennis racket weighs about 450–520 g; this is its effective mass at
 * a typical impact point. The small, asymmetric head is ignored. ⚠ verify.
 */
export const standardRacket: RacketParams = { mass: 0.35, restitution: 0.5, friction: 0.4 };

/** The ball after the racket strikes it. A mishit loses pace and effective mass. */
export function racketImpact(
  p: BallParams,
  ball: BallState,
  racket: Racket,
  params: RacketParams = standardRacket,
): BallState {
  const q = Math.min(1, Math.max(0, racket.timing));
  return collide(
    p,
    ball,
    racket.normal,
    { restitution: params.restitution * (0.6 + 0.4 * q), friction: params.friction },
    { velocity: racket.velocity, massRatio: p.mass / (params.mass * (0.5 + 0.5 * q)) },
  );
}

/** Whether `racket` can strike `ball`: a unit normal, and closing on it. */
export function makesContact(ball: BallState, racket: Racket): boolean {
  return (
    Math.abs(length(racket.normal) - 1) < 1e-6 &&
    dot(sub(ball.velocity, racket.velocity), racket.normal) < 0
  );
}

/**
 * Applies a racket hit to the simulation, starting a new shot. A racket that
 * can't strike the ball (see `makesContact`) changes nothing and reports nothing.
 */
export function hit(
  p: BallParams,
  state: SimState,
  racket: Racket,
  params: RacketParams = standardRacket,
): StepResult {
  if (!makesContact(state.ball, racket)) return { state, events: [] };
  const ball = racketImpact(p, state.ball, racket, params);
  return {
    state: {
      ...state,
      ball,
      live: true,
      captured: null,
      asleep: false,
      bounces: 0,
      fallTime: null,
      lastHitTime: state.time,
    },
    events: [
      {
        type: "racketHit",
        player: racket.player,
        time: state.time,
        position: ball.position,
        surface: "racket",
      },
    ],
  };
}

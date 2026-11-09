import { add, cross, dot, length, madd, normalize, reject, scale, type Vec3 } from "./vec.ts";

export interface BallState {
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** Angular velocity, in rad/s. */
  readonly spin: Vec3;
}

export interface BallParams {
  /** T&RA Law 3: 62–65 mm in diameter. */
  readonly radius: number;
  /** T&RA Law 3: 71–78 g. */
  readonly mass: number;
  /** Moment of inertia as a fraction of m·r². */
  readonly inertia: number;
  readonly dragCoefficient: number;
  /** Fraction of spin lost per second in flight. */
  readonly spinDecay: number;
  readonly airDensity: number;
  readonly gravity: number;
}

/**
 * A mid-spec ball (Law 3). The aerodynamics come from lawn-tennis literature
 * (⚠ verify). Inertia assumes a near-solid ball, as the core is wound cloth
 * rather than a hollow shell (⚠ verify).
 */
export const standardBall: BallParams = {
  radius: 0.0635 / 2,
  mass: 0.0745,
  inertia: 0.4,
  dragCoefficient: 0.55,
  spinDecay: 0.02,
  airDensity: 1.2,
  gravity: 9.81,
};

/** Lift coefficient from the spin parameter S = rω/v (Sawicki). */
export function liftCoefficient(spinParameter: number): number {
  return spinParameter > 0 ? 1 / (2 + 1 / spinParameter) : 0;
}

interface Derivative {
  readonly velocity: Vec3;
  readonly acceleration: Vec3;
  readonly spinRate: Vec3;
}

/** Gravity, quadratic drag and Magnus lift, plus exponential spin decay. */
function derivative(p: BallParams, s: BallState): Derivative {
  const v = s.velocity;
  const speed = length(v);
  const area = Math.PI * p.radius * p.radius;
  const k = (0.5 * p.airDensity * area) / p.mass;
  let a: Vec3 = { x: 0, y: -p.gravity, z: 0 };
  if (speed > 0) {
    a = madd(a, v, -k * p.dragCoefficient * speed);
    const axis = cross(s.spin, v);
    const spinAcross = length(reject(s.spin, scale(v, 1 / speed)));
    const cl = liftCoefficient((p.radius * spinAcross) / speed);
    if (cl > 0) a = madd(a, normalize(axis), k * cl * speed * speed);
  }
  return { velocity: v, acceleration: a, spinRate: scale(s.spin, spinDecayRate(p.spinDecay)) };
}

/** Least fraction of spin kept per second, so the decay rate stays finite. */
const MIN_SPIN_KEPT = 1e-6;

/**
 * The exponential decay rate for losing `decay` of the spin each second. A
 * decay of 1 or more (or NaN) loses nearly all of it; a negative one none.
 */
export function spinDecayRate(decay: number): number {
  const kept = 1 - decay;
  return Math.log(kept > MIN_SPIN_KEPT ? Math.min(1, kept) : MIN_SPIN_KEPT);
}

function advance(s: BallState, d: Derivative, dt: number): BallState {
  return {
    position: madd(s.position, d.velocity, dt),
    velocity: madd(s.velocity, d.acceleration, dt),
    spin: madd(s.spin, d.spinRate, dt),
  };
}

/** Advances a ball in free flight by `dt` with RK4. */
export function flight(p: BallParams, s: BallState, dt: number): BallState {
  const k1 = derivative(p, s);
  const k2 = derivative(p, advance(s, k1, dt / 2));
  const k3 = derivative(p, advance(s, k2, dt / 2));
  const k4 = derivative(p, advance(s, k3, dt));
  const sum = (f: (d: Derivative) => Vec3) =>
    scale(add(add(f(k1), scale(add(f(k2), f(k3)), 2)), f(k4)), dt / 6);
  return {
    position: add(
      s.position,
      sum((d) => d.velocity),
    ),
    velocity: add(
      s.velocity,
      sum((d) => d.acceleration),
    ),
    spin: add(
      s.spin,
      sum((d) => d.spinRate),
    ),
  };
}

/** Kinetic energy, translational plus rotational, in joules. */
export function kineticEnergy(p: BallParams, s: BallState): number {
  const i = p.inertia * p.mass * p.radius * p.radius;
  return 0.5 * p.mass * dot(s.velocity, s.velocity) + 0.5 * i * dot(s.spin, s.spin);
}

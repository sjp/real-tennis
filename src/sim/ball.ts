import { dot, vec, type Vec3 } from "./vec.ts";

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

/** The acceleration `accel` last found, kept here rather than in a new object. */
let ax = 0;
let ay = 0;
let az = 0;

/**
 * Gravity, quadratic drag and Magnus lift on a ball moving at `v` with spin
 * `w`, into `ax`, `ay`, `az`. Written out in numbers, not vectors: the sim
 * spends most of its time here, and the vectors' garbage was half of that.
 */
function accel(
  p: BallParams,
  vx: number,
  vy: number,
  vz: number,
  wx: number,
  wy: number,
  wz: number,
): void {
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const area = Math.PI * p.radius * p.radius;
  const k = (0.5 * p.airDensity * area) / p.mass;
  ax = 0;
  ay = -p.gravity;
  az = 0;
  if (!(speed > 0)) return;
  const drag = -k * p.dragCoefficient * speed;
  ax += vx * drag;
  ay += vy * drag;
  az += vz * drag;
  // The spin across the flight: the spin less its part along it.
  const inv = 1 / speed;
  const ux = vx * inv;
  const uy = vy * inv;
  const uz = vz * inv;
  const along = -(wx * ux + wy * uy + wz * uz);
  const rx = wx + ux * along;
  const ry = wy + uy * along;
  const rz = wz + uz * along;
  const spinAcross = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const cl = liftCoefficient((p.radius * spinAcross) / speed);
  if (!(cl > 0)) return;
  // Lift along spin × velocity.
  const cx = wy * vz - wz * vy;
  const cy = wz * vx - wx * vz;
  const cz = wx * vy - wy * vx;
  const l = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (!(l > 0)) return;
  const lift = k * cl * speed * speed;
  const il = 1 / l;
  ax += cx * il * lift;
  ay += cy * il * lift;
  az += cz * il * lift;
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

/** Advances a ball in free flight by `dt` with RK4. */
export function flight(p: BallParams, s: BallState, dt: number): BallState {
  const rate = spinDecayRate(p.spinDecay);
  const half = dt / 2;
  const { x: px, y: py, z: pz } = s.position;
  // Each stage's velocity v, acceleration a and spin w; the spin's rate is w·rate.
  const { x: v1x, y: v1y, z: v1z } = s.velocity;
  const { x: w1x, y: w1y, z: w1z } = s.spin;
  accel(p, v1x, v1y, v1z, w1x, w1y, w1z);
  const [a1x, a1y, a1z] = [ax, ay, az];
  const [v2x, v2y, v2z] = [v1x + a1x * half, v1y + a1y * half, v1z + a1z * half];
  const [w2x, w2y, w2z] = [
    w1x + w1x * rate * half,
    w1y + w1y * rate * half,
    w1z + w1z * rate * half,
  ];
  accel(p, v2x, v2y, v2z, w2x, w2y, w2z);
  const [a2x, a2y, a2z] = [ax, ay, az];
  const [v3x, v3y, v3z] = [v1x + a2x * half, v1y + a2y * half, v1z + a2z * half];
  const [w3x, w3y, w3z] = [
    w1x + w2x * rate * half,
    w1y + w2y * rate * half,
    w1z + w2z * rate * half,
  ];
  accel(p, v3x, v3y, v3z, w3x, w3y, w3z);
  const [a3x, a3y, a3z] = [ax, ay, az];
  const [v4x, v4y, v4z] = [v1x + a3x * dt, v1y + a3y * dt, v1z + a3z * dt];
  const [w4x, w4y, w4z] = [w1x + w3x * rate * dt, w1y + w3y * rate * dt, w1z + w3z * rate * dt];
  accel(p, v4x, v4y, v4z, w4x, w4y, w4z);
  const [a4x, a4y, a4z] = [ax, ay, az];
  const sixth = dt / 6;
  const sum = (k1: number, k2: number, k3: number, k4: number) => (k1 + (k2 + k3) * 2 + k4) * sixth;
  const r = rate;
  return {
    position: vec(
      px + sum(v1x, v2x, v3x, v4x),
      py + sum(v1y, v2y, v3y, v4y),
      pz + sum(v1z, v2z, v3z, v4z),
    ),
    velocity: vec(
      v1x + sum(a1x, a2x, a3x, a4x),
      v1y + sum(a1y, a2y, a3y, a4y),
      v1z + sum(a1z, a2z, a3z, a4z),
    ),
    spin: vec(
      w1x + sum(w1x * r, w2x * r, w3x * r, w4x * r),
      w1y + sum(w1y * r, w2y * r, w3y * r, w4y * r),
      w1z + sum(w1z * r, w2z * r, w3z * r, w4z * r),
    ),
  };
}

/** Kinetic energy, translational plus rotational, in joules. */
export function kineticEnergy(p: BallParams, s: BallState): number {
  const i = p.inertia * p.mass * p.radius * p.radius;
  return 0.5 * p.mass * dot(s.velocity, s.velocity) + 0.5 * i * dot(s.spin, s.spin);
}

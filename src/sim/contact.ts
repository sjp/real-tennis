import type { BallParams, BallState } from "./ball.ts";
import { cross, dot, lengthSq, madd, reject, scale, sub, ZERO, type Vec3 } from "./vec.ts";

/** How a surface responds to the ball. All values ⚠ verify; tune against video. */
export interface Material {
  /** Coefficient of restitution for the normal component. */
  readonly restitution: number;
  /** Coulomb friction coefficient. */
  readonly friction: number;
  /** Fraction of tangential velocity kept after the impulse; 1 if absent. */
  readonly retention?: number;
}

export interface Impactor {
  /** Velocity of the surface at the contact point. */
  readonly velocity: Vec3;
  /** Ball mass / effective surface mass. Zero for fixed surfaces. */
  readonly massRatio: number;
}

const FIXED: Impactor = { velocity: ZERO, massRatio: 0 };

/**
 * Resolves a contact with unit normal `n` (pointing at the ball), in the
 * style of Cross: restitution on the normal component, and a tangential
 * impulse that stops slip (rolling) unless friction caps it (sliding).
 */
export function collide(
  p: BallParams,
  b: BallState,
  n: Vec3,
  m: Material,
  impactor: Impactor = FIXED,
): BallState {
  const u = sub(b.velocity, impactor.velocity);
  const un = dot(u, n);
  if (un >= 0) return b;
  const k = 1 + impactor.massRatio;
  const jn = (p.mass * (1 + m.restitution) * -un) / k;
  let velocity = madd(b.velocity, n, jn / p.mass);

  // Slip of the contact point, which sits at -r·n from the centre.
  const arm = scale(n, -p.radius);
  const slip = reject(madd(u, cross(b.spin, arm), 1), n);
  const slipSpeed = Math.sqrt(lengthSq(slip));
  let spin = b.spin;
  if (slipSpeed > 1e-12) {
    const rolling = (p.mass * slipSpeed) / (k + 1 / p.inertia);
    const jt = Math.min(rolling, m.friction * jn);
    const impulse = scale(slip, -jt / slipSpeed);
    velocity = madd(velocity, impulse, 1 / p.mass);
    const i = p.inertia * p.mass * p.radius * p.radius;
    spin = madd(spin, cross(arm, impulse), 1 / i);
  }
  if (m.retention !== undefined) {
    const vn = dot(velocity, n);
    velocity = madd(scale(reject(velocity, n), m.retention), n, vn);
  }
  return { position: b.position, velocity, spin };
}

/**
 * Swept-sphere tests. Each takes the centre's path p0 → p0 + d over one
 * sub-step and returns the fraction s ∈ [0, 1] of first contact, or null.
 */

/** A sphere of radius `r` against the plane through `o` with normal `n`, from the front. */
export function sweepPlane(p0: Vec3, d: Vec3, o: Vec3, n: Vec3, r: number): number | null {
  const d0 = dot(sub(p0, o), n) - r;
  const dd = dot(d, n);
  if (dd >= 0) return null;
  // Already touching but still in front of the plane: contact now.
  if (d0 < 0) return d0 > -r ? 0 : null;
  const s = d0 / -dd;
  return s <= 1 ? s : null;
}

/** A sphere of radius `r` against the point `c`. */
export function sweepPoint(p0: Vec3, d: Vec3, c: Vec3, r: number): number | null {
  return sweepRoot(sub(p0, c), d, r);
}

/** Smallest s ∈ [0, 1] with |w + s·d| = r, approaching from outside. */
function sweepRoot(w: Vec3, d: Vec3, r: number): number | null {
  const a = lengthSq(d);
  const b = 2 * dot(w, d);
  const c = lengthSq(w) - r * r;
  if (b >= 0) return null;
  if (c < 0) return 0;
  if (a === 0) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = (-b - Math.sqrt(disc)) / (2 * a);
  return s <= 1 ? s : null;
}

/** A sphere of radius `r` against the segment a–b, including its ends. */
export function sweepSegment(p0: Vec3, d: Vec3, a: Vec3, b: Vec3, r: number): number | null {
  const ab = sub(b, a);
  const len2 = lengthSq(ab);
  const u = scale(ab, 1 / Math.sqrt(len2));
  const w = sub(p0, a);
  let best = sweepRoot(reject(w, u), reject(d, u), r);
  if (best !== null) {
    const t = dot(madd(w, d, best), u);
    if (t < 0 || t * t > len2) best = null;
  }
  for (const end of [a, b]) {
    const s = sweepPoint(p0, d, end, r);
    if (s !== null && (best === null || s < best)) best = s;
  }
  return best;
}

/** The point on segment a–b closest to `p`. */
export function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / lengthSq(ab)));
  return madd(a, ab, t);
}

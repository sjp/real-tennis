import type { Vec3 } from "../court/types.ts";

export type { Vec3 };

export const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
/** a + b·s */
export const madd = (a: Vec3, b: Vec3, s: number): Vec3 => ({
  x: a.x + b.x * s,
  y: a.y + b.y * s,
  z: a.z + b.z * s,
});
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const lengthSq = (a: Vec3): number => dot(a, a);

/** The unit vector along `a`, or zero if `a` is zero. */
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : ZERO;
}

/** The part of `a` perpendicular to the unit vector `n`. */
export const reject = (a: Vec3, n: Vec3): Vec3 => madd(a, n, -dot(a, n));

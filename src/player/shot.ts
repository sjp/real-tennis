import type { Side } from "../court/types.ts";
import type { InputState, ShotType } from "../input/input.ts";
import { flight, type BallParams, type BallState } from "../sim/ball.ts";
import { racketImpact, standardRacket, type Racket, type RacketParams } from "../sim/racket.ts";
import { cross, length, madd, normalize, reject, scale, sub, vec, type Vec3 } from "../sim/vec.ts";
import type { World } from "../sim/world.ts";
import { forwardZ } from "./movement.ts";
import type { Timing } from "./timing.ts";

const DEG = Math.PI / 180;
const DOWN = vec(0, -1, 0);
const UP = vec(0, 1, 0);

/** A racket's face and swing, before the strike quality is known. */
export type Swing = Omit<Racket, "player" | "timing">;

/**
 * Finds the swing that sends `ball` off at `want`. `brush` is how fast the
 * racket slides down its own face: positive cuts under the ball for
 * backspin, negative rolls over it for topspin. `side` slides it across the
 * face, to the striker's left when positive, for sidespin. The spin that
 * results is whatever the contact gives.
 */
export function swingFor(
  p: BallParams,
  ball: BallState,
  want: Vec3,
  brush: number,
  side = 0,
  params: RacketParams = standardRacket,
): Swing {
  let u = scale(sub(want, ball.velocity), 0.8);
  let swing: Swing = { normal: normalize(u), velocity: u };
  for (let i = 0; i < 40; i++) {
    const normal = normalize(u);
    const t = normalize(reject(DOWN, normal));
    // The normal faces the ball, so this is left as the striker sees it.
    const left = normalize(cross(UP, normal));
    swing = { normal, velocity: madd(madd(u, t, brush), left, side) };
    const out = racketImpact(p, ball, { ...swing, player: "", timing: 1 }, params);
    const err = sub(want, out.velocity);
    if (length(err) < 0.01) break;
    u = madd(u, err, 0.8);
  }
  return swing;
}

/** Turns a horizontal direction towards the left by `angle` radians. */
export function turnLeft(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

/**
 * The ball's height when it has travelled `distance` horizontally, in free
 * flight. Falling short counts as below the floor, by how far it fell short.
 */
export function heightAt(p: BallParams, ball: BallState, distance: number): number {
  const start = ball.position;
  let b = ball;
  for (let i = 0; i < 300; i++) {
    const next = flight(p, b, 1 / 60);
    const d0 = Math.hypot(b.position.x - start.x, b.position.z - start.z);
    const d1 = Math.hypot(next.position.x - start.x, next.position.z - start.z);
    if (d1 >= distance) {
      const k = (distance - d0) / (d1 - d0);
      return b.position.y + (next.position.y - b.position.y) * k;
    }
    if (next.position.y < p.radius) return p.radius - (distance - d1);
    b = next;
  }
  return -Infinity;
}

/**
 * Solves f(x) = 0 for increasing `f` on [lo, hi], clamping at the ends. It
 * uses the Illinois variant of false position, which needs few evaluations.
 */
function solve(f: (x: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  let fhi = f(hi);
  if (fhi <= 0) return hi;
  if (flo >= 0) return lo;
  let side = 0;
  for (let i = 0; i < 20; i++) {
    const x = (lo * fhi - hi * flo) / (fhi - flo);
    const fx = f(x);
    if (Math.abs(fx) < 0.005) return x;
    if (fx < 0) {
      lo = x;
      flo = fx;
      if (side === -1) fhi /= 2;
      side = -1;
    } else {
      hi = x;
      fhi = fx;
      if (side === 1) flo /= 2;
      side = 1;
    }
  }
  return (lo * fhi - hi * flo) / (fhi - flo);
}

/** A launch velocity from a speed, elevation and horizontal heading. */
export function launch(speed: number, elevation: number, heading: Vec3): Vec3 {
  const h = normalize(vec(heading.x, 0, heading.z));
  return vec(
    h.x * speed * Math.cos(elevation),
    speed * Math.sin(elevation),
    h.z * speed * Math.cos(elevation),
  );
}

/**
 * The velocity that carries a ball with `spin` from `from` through `target`.
 * Either the speed is fixed and the low trajectory is found, or the
 * elevation is fixed and the speed is found.
 */
export function aimAt(
  p: BallParams,
  from: Vec3,
  target: Vec3,
  spin: Vec3,
  fixed: { readonly speed: number } | { readonly elevation: number },
): Vec3 {
  const heading = sub(target, from);
  const distance = Math.hypot(heading.x, heading.z);
  const reach = (v: Vec3) =>
    heightAt(p, { position: from, velocity: v, spin }, distance) - target.y;
  if ("speed" in fixed) {
    const e = solve((e) => reach(launch(fixed.speed, e, heading)), -30 * DEG, 40 * DEG);
    return launch(fixed.speed, e, heading);
  }
  const s = solve((s) => reach(launch(s, fixed.elevation, heading)), 2, 40);
  return launch(s, fixed.elevation, heading);
}

interface ShotStyle {
  /** Fixed speed (m/s), or fixed elevation (degrees) with the speed found. */
  readonly speed?: number;
  readonly elevation?: number;
  readonly brush: number;
  /** For floor targets: how far short of the far end wall the ball lands. */
  readonly depth: number;
}

/** ⚠ verify, all of them: starting points to tune in play. */
export const SHOT_STYLES: Record<ShotType, ShotStyle> = {
  drive: { speed: 24, brush: -1, depth: 3 },
  cut: { speed: 18, brush: 5, depth: 2.5 },
  lob: { elevation: 50, brush: 2, depth: 1.5 },
  boast: { speed: 16, brush: 3, depth: 0 },
};

/** How far aiming sideways, deeper and shorter moves the target (m). */
const AIM_SIDEWAYS = 3.5;
const AIM_DEEPER = 1.5;
const AIM_SHORTER = 8;
/** Boasts strike the side wall at this height, below the galleries. */
const BOAST_HEIGHT = 0.9;

/**
 * Where a shot is aimed. Floor shots land on the far side of the net; a
 * boast goes off the nearer side wall first. `aim` is the camera-relative
 * move input held at contact.
 */
export function shotTarget(
  world: World,
  type: ShotType,
  from: Vec3,
  end: Side,
  aim: InputState["move"],
): Vec3 {
  const { width, length: len } = world.court.floor;
  const hw = width / 2;
  const hl = len / 2;
  const f = forwardZ(end);
  const r = world.ball.radius;
  // The striker's right is -x when facing +z.
  const right = -f;
  if (type === "boast") {
    const wall = from.x < 0 ? -hw : hw;
    // Off the wall ahead of the striker, half way to the net.
    const ahead = Math.max(1, Math.abs(from.z) / 2) + aim.y * 1.5;
    return vec(wall, BOAST_HEIGHT, from.z + f * Math.max(0.5, ahead));
  }
  const style = SHOT_STYLES[type];
  const depth = style.depth - aim.y * (aim.y > 0 ? AIM_DEEPER : AIM_SHORTER);
  const x = aim.x * right * AIM_SIDEWAYS;
  return vec(
    Math.min(hw - 0.5, Math.max(-hw + 0.5, x)),
    r,
    f * Math.min(hl - 0.5, Math.max(1, hl - depth)),
  );
}

export interface ShotPlan {
  readonly target: Vec3;
  /** The racket, with the strike's quality applied. */
  readonly racket: Racket;
}

/**
 * Plans the racket for a shot at `ball`. The aimed velocity is turned off
 * line by the timing's pull; a mishit then loses pace in `racketImpact`.
 */
export function planShot(
  world: World,
  player: string,
  type: ShotType,
  ball: BallState,
  end: Side,
  aim: InputState["move"],
  timing: Timing,
): ShotPlan {
  const p = world.ball;
  const style = SHOT_STYLES[type];
  const target = shotTarget(world, type, ball.position, end, aim);
  const fixed =
    style.elevation !== undefined ? { elevation: style.elevation * DEG } : { speed: style.speed! };
  // The spin depends on the swing and the swing on the spin, so go round again.
  let spin = ball.spin;
  let swing: Swing | undefined;
  for (let i = 0; i < 2; i++) {
    const want = turnLeft(aimAt(p, ball.position, target, spin, fixed), timing.pull);
    swing = swingFor(p, ball, want, style.brush);
    spin = racketImpact(p, ball, { ...swing, player, timing: 1 }).spin;
  }
  return { target, racket: { ...swing!, player, timing: timing.quality } };
}

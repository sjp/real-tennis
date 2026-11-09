import { Euler, Quaternion, Vector3 } from "three";
import { FOLLOW_THROUGH } from "../game/player.ts";
import { handPosition } from "../player/serve.ts";
import { SWING_TIME } from "../player/timing.ts";

const DEG = Math.PI / 180;

// Law 4: at most 680 mm overall.
export const RACKET_LENGTH = 0.68;
export const HEAD_LENGTH = 0.25;
export const HANDLE_LENGTH = RACKET_LENGTH - HEAD_LENGTH;

/**
 * The racket arm, in the player's frame (facing +z, right is -x). The arm
 * points along its local +x, tilted down, and the racket is angled up from
 * the hand by the wrist.
 */
export const ARM = {
  length: 0.5,
  tilt: -40 * DEG,
  wrist: 30 * DEG,
  /** From the hand to the middle of the head. */
  reach: HANDLE_LENGTH + HEAD_LENGTH / 2,
} as const;

/** The middle of the racket head, in the arm's frame before it turns. */
export function racketCentre(wrist: number = ARM.wrist): Vector3 {
  const r = new Vector3(Math.cos(wrist), Math.sin(wrist), 0).multiplyScalar(ARM.reach);
  return r.add(new Vector3(ARM.length, 0, 0)).applyAxisAngle(new Vector3(0, 0, 1), ARM.tilt);
}

/** The wrist angle that puts the middle of the head `distance` from the shoulder. */
function wristFor(distance: number): number {
  const { length: a, reach: b } = ARM;
  const cos = (distance ** 2 - a * a - b * b) / (2 * a * b);
  return Math.max(ARM.wrist, Math.acos(Math.min(1, Math.max(-1, cos))));
}

const aim = (wrist: number, to: Vector3) =>
  new Quaternion().setFromUnitVectors(racketCentre(wrist).normalize(), to.clone().normalize());

/** Directions of the racket from the shoulder, before and after contact. */
const KEYS = {
  /** Back behind the head, up to the ball, then down across the body. */
  overarm: { back: new Vector3(-0.3, 0.2, -1), through: new Vector3(0.5, -0.6, 0.8) },
  /** Back and low, up through the ball, and on up in front. */
  underarm: { back: new Vector3(-0.5, -0.7, -0.6), through: new Vector3(-0.1, 0.4, 1) },
};

export interface ArmPose {
  readonly arm: Quaternion;
  readonly wrist: number;
}

/**
 * The racket arm through a serve, `t` seconds after swing was pressed. The
 * middle of the racket head meets the serving contact point (the one hits
 * are judged against) exactly at contact, SWING_TIME after the press.
 */
export function serveArm(
  t: number,
  overarm: boolean,
  contactHeight: number,
  shoulder: Vector3,
  idle: Quaternion,
): ArmPose {
  const c = handPosition({ x: 0, z: 0 }, "service", contactHeight);
  const d = new Vector3(c.x, c.y, c.z).sub(shoulder);
  const wrist = wristFor(d.length());
  const contact = aim(wrist, d);
  const keys = KEYS[overarm ? "overarm" : "underarm"];
  const back = aim(wrist, keys.back);
  const through = aim(wrist, keys.through);
  const q = new Quaternion();
  if (t <= 0) return { arm: q.copy(idle), wrist: ARM.wrist };
  const k = t / SWING_TIME;
  // Back quickly, cocking the wrist, then accelerate through to contact.
  if (k < 0.35) {
    const u = k / 0.35;
    return { arm: q.slerpQuaternions(idle, back, u), wrist: ARM.wrist + (wrist - ARM.wrist) * u };
  }
  if (k <= 1) return { arm: q.slerpQuaternions(back, contact, ((k - 0.35) / 0.65) ** 1.5), wrist };
  const u = Math.min(1, (t - SWING_TIME) / FOLLOW_THROUGH);
  return { arm: q.slerpQuaternions(contact, through, u), wrist };
}

/** The arm's turn for a groundstroke angle: 0° out to the side, positive forwards. */
export function groundstrokeArm(angle: number, backhand: boolean): Quaternion {
  return new Quaternion().setFromEuler(
    new Euler(0, backhand ? -angle * DEG : Math.PI + angle * DEG, 0),
  );
}

/**
 * Racket angle about the shoulder, in degrees, through the swing: back to
 * contact (0, racket out to the side) and on into the follow-through.
 */
export function armAngle(t: number): number {
  if (t < 0) return -20;
  if (t < SWING_TIME) {
    const k = t / SWING_TIME;
    // Take the racket back quickly, then accelerate through.
    return k < 0.35 ? -20 - (k / 0.35) * 90 : -110 + ((k - 0.35) / 0.65) * 110;
  }
  return Math.min(90, ((t - SWING_TIME) / FOLLOW_THROUGH) * 90);
}

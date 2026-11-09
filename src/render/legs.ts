/** The legs' sizes, in metres, and their pose. */

export const HIP = 0.92;
export const THIGH = 0.44;
export const SHIN = 0.43;
/** Height of the ankle joint off the floor. A little short of a straight leg, so the knees stay soft. */
export const ANKLE = 0.07;

/**
 * Two-bone leg IK: the thigh's swing forwards and sideways from the hip and the
 * knee's bend, for a foot `forward` and `side` of the hip and `lift` off the floor.
 */
export function legPose(forward: number, side: number, lift: number) {
  const h = HIP - ANKLE - lift;
  const out = Math.atan2(side, h);
  const down = Math.hypot(h, side);
  const d = Math.min(THIGH + SHIN - 1e-3, Math.hypot(down, forward));
  const thigh =
    Math.atan2(forward, down) + Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
  const knee = Math.PI - Math.acos((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN));
  return { thigh, knee, out };
}

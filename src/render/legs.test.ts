import { describe, expect, it } from "vitest";
import { ANKLE, HIP, legPose, SHIN, THIGH } from "./legs.ts";

/** Where the ankle ends up, forwards and down from the hip in the leg's plane. */
function ankle(thigh: number, knee: number) {
  const shin = thigh - knee;
  return {
    forward: THIGH * Math.sin(thigh) + SHIN * Math.sin(shin),
    down: THIGH * Math.cos(thigh) + SHIN * Math.cos(shin),
  };
}

describe("legPose", () => {
  it("puts the ankle where it's asked, bending the knee forwards", () => {
    for (const [forward, side, lift] of [
      [0, 0, 0],
      [0.25, 0.04, 0.1],
      [-0.3, -0.1, 0.12],
    ] as const) {
      const p = legPose(forward, side, lift);
      const a = ankle(p.thigh, p.knee);
      expect(a.forward).toBeCloseTo(forward, 6);
      expect(a.down).toBeCloseTo(Math.hypot(HIP - ANKLE - lift, side), 6);
      expect(p.out).toBeCloseTo(Math.atan2(side, HIP - ANKLE - lift), 9);
      expect(p.knee).toBeGreaterThan(0);
      expect(p.knee).toBeLessThan(Math.PI);
    }
  });

  it("reaches as far as it can at full stretch, with no NaN", () => {
    for (const forward of [THIGH + SHIN, 2, -5, 100]) {
      const p = legPose(forward, 0.5, 0);
      expect(Number.isFinite(p.thigh) && Number.isFinite(p.knee)).toBe(true);
      expect(p.knee).toBeGreaterThanOrEqual(0);
      expect(p.knee).toBeLessThan(0.2);
      // Pointing straight at the target.
      const a = ankle(p.thigh, p.knee);
      const down = Math.hypot(HIP - ANKLE, 0.5);
      expect(Math.atan2(a.forward, a.down)).toBeCloseTo(Math.atan2(forward, down), 2);
    }
  });
});

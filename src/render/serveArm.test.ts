import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { handPosition, SERVE_STYLES } from "../player/serve.ts";
import { SWING_TIME } from "../player/timing.ts";
import { racketCentre, serveArm } from "./serveArm.ts";

const shoulder = new Vector3(-0.21, 1.42, 0);
function centreAt(t: number, overarm: boolean, height: number): Vector3 {
  const pose = serveArm(t, overarm, height, shoulder, new Quaternion());
  return racketCentre(pose.wrist).applyQuaternion(pose.arm).add(shoulder);
}

describe("serveArm", () => {
  it.each(SERVE_STYLES.map((s) => [s.name, s] as const))(
    "meets the contact point at contact for the %s",
    (_, style) => {
      const c = handPosition({ x: 0, z: 0 }, "service", style.contactHeight);
      const at = centreAt(SWING_TIME, style.overarm, style.contactHeight);
      // The head is 25 cm long; its middle should be within half of that.
      expect(at.distanceTo(new Vector3(c.x, c.y, c.z))).toBeLessThan(0.15);
    },
  );

  it("is well away from the contact point a fifth of the swing either side", () => {
    for (const style of SERVE_STYLES) {
      const c = handPosition({ x: 0, z: 0 }, "service", style.contactHeight);
      const p = new Vector3(c.x, c.y, c.z);
      const near = centreAt(SWING_TIME, style.overarm, style.contactHeight).distanceTo(p);
      for (const dt of [-0.05, 0.05])
        expect(
          centreAt(SWING_TIME + dt, style.overarm, style.contactHeight).distanceTo(p),
        ).toBeGreaterThan(near + 0.1);
    }
  });
});

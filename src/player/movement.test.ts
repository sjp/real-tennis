import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { IDLE, type InputState } from "../input/input.ts";
import { STEP } from "../sim/world.ts";
import { clampToEnd, move, standardPlayer as params, type Motion } from "./movement.ts";

const hw = court.floor.width / 2;
const hl = court.floor.length / 2;
const still: Motion = { position: { x: 0, z: -8 }, velocity: { x: 0, z: 0 } };

function run(m: Motion, input: InputState, seconds: number, end: "service" | "hazard" = "service") {
  for (let i = 0; i < seconds / STEP; i++) m = move(court, params, m, input, end, STEP);
  return m;
}

const forwards = { ...IDLE, move: { x: 0, y: 1 } };

describe("move", () => {
  it("accelerates to run speed, and faster when sprinting", () => {
    const after = (s: number, sprint = false) => run(still, { ...forwards, sprint }, s).velocity.z;
    expect(after(0.1)).toBeCloseTo(params.acceleration * 0.1, 1);
    expect(after(1)).toBeCloseTo(params.runSpeed);
    expect(after(1, true)).toBeCloseTo(params.sprintSpeed);
  });

  it("moves relative to the camera at either end", () => {
    const right = { ...IDLE, move: { x: 1, y: 0 } };
    // From the service end the camera looks along +z, so its right is -x.
    expect(run(still, right, 0.5).position.x).toBeLessThan(0);
    expect(run(still, forwards, 0.5).position.z).toBeGreaterThan(-8);
    const far = { ...still, position: { x: 0, z: 8 } };
    expect(run(far, right, 0.5, "hazard").position.x).toBeGreaterThan(0);
    expect(run(far, forwards, 0.5, "hazard").position.z).toBeLessThan(8);
  });

  it("slows to a stop when let go", () => {
    const moving = run(still, forwards, 1);
    expect(run(moving, IDLE, 1).velocity).toEqual({ x: 0, z: 0 });
  });

  it("never reaches the net", () => {
    const m = run(still, { ...forwards, sprint: true }, 4);
    expect(m.position.z).toBeCloseTo(-params.netClearance);
    expect(m.velocity.z).toBe(0);
  });
});

describe("clampToEnd", () => {
  it("keeps the body inside the walls", () => {
    expect(clampToEnd(court, params, "service", { x: 99, z: -99 })).toEqual({
      x: hw - params.radius,
      z: -hl + params.radius,
    });
  });

  it("keeps the body off the tambour", () => {
    const p = clampToEnd(court, params, "hazard", { x: -hw, z: hl - 1 });
    expect(p.x).toBeCloseTo(-hw + court.tambour.projection + params.radius);
    expect(clampToEnd(court, params, "hazard", { x: -hw, z: 3 }).x).toBeCloseTo(
      -hw + params.radius,
    );
  });
});

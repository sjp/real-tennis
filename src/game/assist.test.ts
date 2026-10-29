import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { vec, ZERO } from "../sim/vec.ts";
import { createWorld, initialState, predict } from "../sim/world.ts";
import { assist } from "./assist.ts";

const world = createWorld(court);
const coming = initialState({ position: vec(0, 1.5, 8), velocity: vec(0, 4, -14), spin: ZERO });
const prediction = predict(world, coming, 3);
const near = { position: { x: 0, z: -8 }, velocity: { x: 0, z: 0 } };

describe("assist", () => {
  it("marks the next bounce and a reachable interception", () => {
    const a = assist(prediction, near, "service", 0);
    expect(a.bounce?.z).toBeLessThan(0);
    expect(a.intercept!.z).toBeLessThan(0);
    expect(a.intercept!.y).toBeGreaterThanOrEqual(0.2);
  });

  it("finds nothing to intercept for a player out of reach", () => {
    const far = { ...near, position: { x: 4, z: -1 } };
    const slow = initialState({ position: vec(-4, 1, -2), velocity: vec(0, 0, -6), spin: ZERO });
    expect(assist(predict(world, slow, 0.3), far, "service", 0).intercept).toBeNull();
  });

  it("ignores balls on the far side of the net", () => {
    expect(assist(prediction, near, "hazard", 0).intercept?.z ?? 1).toBeGreaterThan(0);
  });
});

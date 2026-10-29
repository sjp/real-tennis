import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { IDLE } from "../input/input.ts";
import { racketImpact } from "../sim/racket.ts";
import { length, sub, vec, ZERO, type Vec3 } from "../sim/vec.ts";
import { createWorld, initialState, predict } from "../sim/world.ts";
import { planShot, swingFor } from "./shot.ts";
import { grade } from "./timing.ts";

const world = createWorld(court);
const p = world.ball;
const hl = court.floor.length / 2;

/** A ball coming back towards a player at the service end. */
const incoming = { position: vec(1, 0.9, -9), velocity: vec(0.5, 1, -8), spin: vec(-60, 0, 0) };

function landing(plan: ReturnType<typeof planShot>, ball = incoming): Vec3 {
  const struck = racketImpact(p, ball, plan.racket);
  const { events } = predict(world, initialState(struck), 4);
  const bounce = events.find((e) => e.type === "floorBounce" || e.type === "wallHit");
  return bounce!.position;
}

describe("swingFor", () => {
  it("finds a swing that sends the ball where asked", () => {
    const want = vec(-2, 4, 20);
    for (const brush of [-2, 0, 5]) {
      const swing = swingFor(p, incoming, want, brush);
      const out = racketImpact(p, incoming, { ...swing, player: "", timing: 1 });
      expect(length(sub(out.velocity, want))).toBeLessThan(0.05);
    }
  });

  it("cuts under the ball for backspin", () => {
    const swing = swingFor(p, incoming, vec(0, 3, 18), 5);
    const out = racketImpact(p, incoming, { ...swing, player: "", timing: 1 });
    // Travelling +z, spin about -x is backspin.
    expect(out.spin.x).toBeLessThan(-50);
  });
});

describe("planShot", () => {
  const perfect = grade(0, false);

  it.each(["drive", "cut", "lob"] as const)("lands a perfect %s near its target", (type) => {
    const plan = planShot(world, "a", type, incoming, "service", IDLE.move, perfect);
    const at = landing(plan);
    expect(Math.hypot(at.x - plan.target.x, at.z - plan.target.z)).toBeLessThan(1);
    expect(plan.target.z).toBeGreaterThan(hl - 4);
  });

  it("sends a boast off the nearer side wall first", () => {
    const plan = planShot(world, "a", "boast", incoming, "service", IDLE.move, perfect);
    const struck = racketImpact(p, incoming, plan.racket);
    const { events } = predict(world, initialState(struck), 4);
    expect(events[0]).toMatchObject({ type: "wallHit", surface: "sideWall" });
  });

  it("aims shorter, deeper and sideways with the move input", () => {
    const target = (x: number, y: number) =>
      planShot(world, "a", "cut", incoming, "service", { x, y }, perfect).target;
    expect(target(0, -1).z).toBeLessThan(target(0, 0).z - 4);
    expect(target(0, 1).z).toBeGreaterThan(target(0, 0).z);
    // Facing +z, the striker's right is -x.
    expect(target(1, 0).x).toBeLessThan(-2);
  });

  it("aims at the far end from the hazard end too", () => {
    const ball = { position: vec(0, 1, 9), velocity: vec(0, 0, 6), spin: ZERO };
    const plan = planShot(world, "a", "cut", ball, "hazard", IDLE.move, perfect);
    expect(plan.target.z).toBeLessThan(-hl + 4);
    expect(landing(plan, ball).z).toBeLessThan(-hl + 4);
  });

  it("pulls an early forehand left and pushes a late one right", () => {
    const x = (error: number) =>
      landing(planShot(world, "a", "cut", incoming, "service", IDLE.move, grade(error, false))).x;
    // Facing +z, the striker's left is +x.
    expect(x(0.12)).toBeGreaterThan(x(0) + 1);
    expect(x(-0.12)).toBeLessThan(x(0) - 1);
  });

  it("loses pace the worse the timing", () => {
    const speed = (error: number) => {
      const plan = planShot(
        world,
        "a",
        "drive",
        incoming,
        "service",
        IDLE.move,
        grade(error, false),
      );
      return length(racketImpact(p, incoming, plan.racket).velocity);
    };
    expect(speed(0.06)).toBeLessThan(speed(0));
    expect(speed(0.14)).toBeLessThan(speed(0.06));
  });
});

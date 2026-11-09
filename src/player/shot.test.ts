import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { IDLE } from "../input/input.ts";
import { racketImpact } from "../sim/racket.ts";
import { length, sub, vec, ZERO, type Vec3 } from "../sim/vec.ts";
import { createWorld, initialState, predict } from "../sim/world.ts";
import { heightAt, planShot, shotTarget, SHOT_STYLES, swingFor, turnLeft } from "./shot.ts";
import { grade } from "./timing.ts";

const world = createWorld(court);
const p = world.ball;
const hl = court.floor.length / 2;
const hw = court.floor.width / 2;

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

describe("turnLeft", () => {
  it("turns towards the left facing down the court, keeping the height and length", () => {
    // Facing +z, the left is +x.
    const v = turnLeft(vec(0, 2, 1), Math.PI / 2);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBe(2);
    expect(v.z).toBeCloseTo(0);
    const w = turnLeft(vec(3, -1, 4), 0.7);
    expect(Math.hypot(w.x, w.z)).toBeCloseTo(5);
    expect(turnLeft(vec(3, -1, 4), -0.7).x).toBeLessThan(3);
  });
});

describe("heightAt", () => {
  const ball = { position: vec(0, 1, 0), velocity: vec(0, 0, 10), spin: ZERO };

  it("starts at the ball's height and falls, a little faster than in a vacuum for drag", () => {
    expect(heightAt(p, ball, 0)).toBeCloseTo(1);
    const at = (d: number) => heightAt(p, ball, d);
    expect(at(2)).toBeLessThan(at(1));
    const vacuum = 1 - (p.gravity * 2 ** 2) / (2 * 10 ** 2);
    expect(at(2)).toBeLessThan(vacuum);
    expect(at(2)).toBeGreaterThan(vacuum - 0.05);
  });

  it("goes below the floor by however far the ball falls short", () => {
    const slow = { position: vec(0, 0.5, 0), velocity: vec(0, 0, 2), spin: ZERO };
    // In a vacuum it would land about 0.6 m away.
    const h = heightAt(p, slow, 5);
    expect(h).toBeLessThan(p.radius - 4.3);
    expect(h).toBeGreaterThan(p.radius - 4.6);
  });
});

describe("SHOT_STYLES", () => {
  it("fixes either the speed or the elevation of each shot, not both", () => {
    for (const s of Object.values(SHOT_STYLES))
      expect((s.speed === undefined) !== (s.elevation === undefined)).toBe(true);
  });

  it("drives hardest with topspin, cuts with backspin, and lofts the lob", () => {
    const { drive, cut, lob, boast } = SHOT_STYLES;
    expect(drive.brush).toBeLessThan(0);
    expect(cut.brush).toBeGreaterThan(0);
    expect(drive.speed!).toBeGreaterThan(Math.max(cut.speed!, boast.speed!));
    expect(lob.elevation).toBeGreaterThan(30);
  });
});

describe("shotTarget", () => {
  const from = vec(1, 1, -8);
  const target = (
    type: Parameters<typeof shotTarget>[1],
    x = 0,
    y = 0,
    end: "service" | "hazard" = "service",
  ) => shotTarget(world, type, end === "service" ? from : vec(1, 1, 8), end, { x, y });

  it.each(["drive", "cut", "lob"] as const)(
    "aims a %s on the floor its depth short of the far end wall",
    (type) => {
      for (const end of ["service", "hazard"] as const) {
        const t = target(type, 0, 0, end);
        expect(t.x).toBeCloseTo(0);
        expect(t.y).toBe(p.radius);
        expect(t.z).toBeCloseTo((end === "service" ? 1 : -1) * (hl - SHOT_STYLES[type].depth));
      }
    },
  );

  it("maps the aim to 3.5 m sideways, 1.5 m deeper and 8 m shorter", () => {
    const base = target("cut");
    expect(target("cut", 1, 0).x).toBeCloseTo(-3.5);
    expect(target("cut", 0.5, 0).x).toBeCloseTo(-1.75);
    expect(target("cut", 0, 1).z).toBeCloseTo(base.z + 1.5);
    expect(target("cut", 0, -1).z).toBeCloseTo(base.z - 8);
    // From the hazard end, the striker's right is +x.
    expect(target("cut", 1, 0, "hazard").x).toBeCloseTo(3.5);
  });

  it("keeps the target half a metre inside the walls, and past the net", () => {
    expect(target("lob", 0, 1).z).toBeCloseTo(hl - 0.5);
    const wide = shotTarget(world, "cut", from, "service", { x: -10, y: 0 });
    expect(wide.x).toBeCloseTo(hw - 0.5);
    const short = shotTarget(world, "cut", from, "service", { x: 0, y: -10 });
    expect(short.z).toBe(1);
  });

  it("sends a boast at the nearer side wall, ahead of the striker", () => {
    const left = shotTarget(world, "boast", vec(-2, 1, -8), "service", { x: 0, y: 0 });
    expect(left).toEqual(vec(-hw, 0.9, -4));
    const right = shotTarget(world, "boast", vec(2, 1, -8), "service", { x: 0, y: 1 });
    expect(right).toEqual(vec(hw, 0.9, -2.5));
    // Never behind the striker, even aimed short near the net.
    const near = shotTarget(world, "boast", vec(2, 1, -1), "service", { x: 0, y: -1 });
    expect(near.z).toBeCloseTo(-0.5);
  });
});

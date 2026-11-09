import { describe, expect, it } from "vitest";
import { standardBall as ball } from "./ball.ts";
import { hit, racketImpact, type Racket } from "./racket.ts";
import { length, normalize, vec, ZERO } from "./vec.ts";
import { initialState } from "./world.ts";

const still = { position: vec(0, 1, 0), velocity: ZERO, spin: ZERO };
const flat: Racket = { player: "a", velocity: vec(0, 0, 20), normal: vec(0, 0, 1), timing: 1 };

describe("racketImpact", () => {
  it("sends a still ball off faster than the racket", () => {
    const out = racketImpact(ball, still, flat);
    expect(out.velocity.z).toBeGreaterThan(20);
    expect(out.velocity.z).toBeLessThan(30);
    expect(length(out.spin)).toBeCloseTo(0);
  });

  it("puts backspin on with an open face", () => {
    const open = { ...flat, normal: normalize(vec(0, 0.5, 1)) };
    const out = racketImpact(ball, still, open);
    // Travelling +z, spin about -x is backspin.
    expect(out.spin.x).toBeLessThan(-50);
    expect(out.velocity.y).toBeGreaterThan(0);
  });

  it("loses pace on a mishit", () => {
    const sweet = racketImpact(ball, still, flat).velocity.z;
    const mishit = racketImpact(ball, still, { ...flat, timing: 0 }).velocity.z;
    expect(mishit).toBeLessThan(0.8 * sweet);
  });

  it("does nothing if the racket isn't closing on the ball", () => {
    expect(racketImpact(ball, still, { ...flat, velocity: vec(0, 0, -5) })).toEqual(still);
  });
});

describe("hit", () => {
  it("starts a new shot and reports it", () => {
    const resting = { ...initialState(still), live: false, asleep: true, bounces: 2, fallTime: 1 };
    const { state, events } = hit(ball, resting, flat);
    expect(state).toMatchObject({ live: true, asleep: false, bounces: 0, fallTime: null });
    expect(events).toMatchObject([{ type: "racketHit", player: "a", surface: "racket" }]);
  });

  it("does nothing and reports nothing if the racket isn't closing on the ball (195)", () => {
    const s = initialState(still);
    expect(hit(ball, s, { ...flat, velocity: vec(0, 0, -5) })).toEqual({ state: s, events: [] });
  });

  it("does nothing with a zero or non-unit normal (195)", () => {
    const s = initialState(still);
    expect(hit(ball, s, { ...flat, normal: ZERO }).events).toEqual([]);
    expect(hit(ball, s, { ...flat, normal: vec(0, 0, 2) }).events).toEqual([]);
  });

  it("frees a ball held by an opening", () => {
    const held = { ...initialState(still), live: false, captured: "dedans" as const };
    const { state } = hit(ball, held, flat);
    expect(state).toMatchObject({ live: true, captured: null });
  });
});

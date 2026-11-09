import { describe, expect, it } from "vitest";
import { standardBall as ball } from "./ball.ts";
import { closestOnSegment, collide, sweepPlane, sweepSegment } from "./contact.ts";
import { cross, scale, vec, ZERO } from "./vec.ts";

const UP = vec(0, 1, 0);

describe("sweepPlane", () => {
  const r = 0.1;

  it("finds the fraction of the path at first touch", () => {
    expect(sweepPlane(vec(0, 1, 0), vec(0, -2, 0), ZERO, UP, r)).toBeCloseTo(0.45);
  });

  it("touches at once when the ball already overlaps the plane from in front", () => {
    expect(sweepPlane(vec(0, r / 2, 0), vec(0, -1, 0), ZERO, UP, r)).toBe(0);
  });

  it("ignores a ball moving away, or whose centre is behind the plane", () => {
    expect(sweepPlane(vec(0, r / 2, 0), vec(0, 1, 0), ZERO, UP, r)).toBeNull();
    expect(sweepPlane(vec(0, -r / 2, 0), vec(0, -1, 0), ZERO, UP, r)).toBeNull();
  });
});

describe("sweepSegment", () => {
  // A post's corner: a vertical edge from the floor to 1 m.
  const a = ZERO;
  const b = vec(0, 1, 0);
  const r = 0.1;

  it("hits the side of the edge", () => {
    expect(sweepSegment(vec(-1, 0.5, 0), vec(2, 0, 0), a, b, r)).toBeCloseTo(0.45);
  });

  it("hits the end of the edge, past its length", () => {
    // Half a radius above the top, so the contact is on the end's sphere.
    const s = sweepSegment(vec(-1, 1 + r / 2, 0), vec(2, 0, 0), a, b, r)!;
    expect(s).toBeCloseTo((1 - Math.sqrt(r * r - (r / 2) ** 2)) / 2);
  });

  it("misses a ball passing beyond the end", () => {
    expect(sweepSegment(vec(-1, 1 + 2 * r, 0), vec(2, 0, 0), a, b, r)).toBeNull();
  });

  it("treats a zero-length edge as a point (195)", () => {
    expect(sweepSegment(vec(-1, 0, 0), vec(2, 0, 0), a, a, r)).toBeCloseTo(0.45);
    expect(sweepSegment(vec(-1, 1, 0), vec(2, 0, 0), a, a, r)).toBeNull();
  });
});

describe("closestOnSegment", () => {
  it("is the point itself for a zero-length segment (195)", () => {
    expect(closestOnSegment(vec(1, 2, 3), UP, UP)).toEqual(UP);
  });
});

describe("collide", () => {
  // A ball skidding along +x into the floor, without spin.
  const skid = { position: vec(0, ball.radius, 0), velocity: vec(5, -1, 0), spin: ZERO };
  const contactSlip = (v: typeof skid) => v.velocity.x + cross(v.spin, scale(UP, -ball.radius)).x;

  it("grips into rolling when friction is high enough", () => {
    const out = collide(ball, skid, UP, { restitution: 0.5, friction: 10 });
    expect(out.velocity.y).toBeCloseTo(0.5);
    expect(contactSlip(out)).toBeCloseTo(0, 9);
    // A solid-ish ball keeps 1/(1 + I) of its speed: 5/1.4.
    expect(out.velocity.x).toBeCloseTo(5 / (1 + ball.inertia));
  });

  it("slides, losing friction × the normal impulse, when friction is low", () => {
    const out = collide(ball, skid, UP, { restitution: 0.5, friction: 0.1 });
    expect(out.velocity.x).toBeCloseTo(5 - 0.1 * 1.5 * 1);
    expect(contactSlip(out)).toBeGreaterThan(0);
  });
});

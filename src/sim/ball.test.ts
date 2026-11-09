import { describe, expect, it } from "vitest";
import {
  flight,
  liftCoefficient,
  spinDecayRate,
  standardBall,
  type BallParams,
  type BallState,
} from "./ball.ts";
import { length, vec, ZERO } from "./vec.ts";

const dt = 1 / 240;

function fly(p: BallParams, s: BallState, seconds: number): BallState {
  for (let i = 0; i < Math.round(seconds / dt); i++) s = flight(p, s, dt);
  return s;
}

const vacuum: BallParams = { ...standardBall, airDensity: 0 };

describe("flight", () => {
  it("matches the analytic free-fall path in a vacuum", () => {
    const s = fly(vacuum, { position: vec(0, 5, 0), velocity: vec(2, 3, -1), spin: ZERO }, 1);
    expect(s.position.x).toBeCloseTo(2, 9);
    expect(s.position.y).toBeCloseTo(5 + 3 - 9.81 / 2, 9);
    expect(s.position.z).toBeCloseTo(-1, 9);
    expect(s.velocity.y).toBeCloseTo(3 - 9.81, 9);
  });

  it("slows the ball with drag", () => {
    const start = { position: vec(0, 5, 0), velocity: vec(0, 0, 30), spin: ZERO };
    const s = fly(standardBall, start, 0.5);
    expect(s.velocity.z).toBeLessThan(25);
    expect(s.velocity.z).toBeGreaterThan(15);
  });

  it("lifts a backspun ball and dips a topspun one (Magnus)", () => {
    // Travelling +z, spin about -x is backspin: ω × v points up.
    const back = { position: vec(0, 2, 0), velocity: vec(0, 0, 20), spin: vec(-100, 0, 0) };
    const top = { ...back, spin: vec(100, 0, 0) };
    const flat = { ...back, spin: ZERO };
    const y = (s: BallState) => fly(standardBall, s, 0.3).position.y;
    expect(y(back)).toBeGreaterThan(y(flat));
    expect(y(top)).toBeLessThan(y(flat));
  });

  it("decays spin by about 2% a second", () => {
    const s = fly(standardBall, { position: ZERO, velocity: ZERO, spin: vec(0, 50, 0) }, 1);
    expect(length(s.spin)).toBeCloseTo(49, 3);
  });

  it("is deterministic", () => {
    const start = { position: vec(1, 2, 3), velocity: vec(-4, 5, 20), spin: vec(30, -10, 5) };
    expect(fly(standardBall, start, 2)).toEqual(fly(standardBall, start, 2));
  });
});

describe("liftCoefficient", () => {
  it("is zero without spin and approaches 0.5 at high spin", () => {
    expect(liftCoefficient(0)).toBe(0);
    expect(liftCoefficient(1)).toBeCloseTo(1 / 3);
    expect(liftCoefficient(1000)).toBeCloseTo(0.5, 2);
  });
});

describe("spinDecayRate", () => {
  it("loses the given fraction of spin each second", () => {
    expect(Math.exp(spinDecayRate(0.02))).toBeCloseTo(0.98);
    expect(spinDecayRate(0)).toBe(0);
  });

  it("stays finite for a decay of 1 or more, or NaN (195)", () => {
    for (const decay of [1, 1.5, Number.NaN]) {
      expect(Number.isFinite(spinDecayRate(decay))).toBe(true);
      const spun = { position: vec(0, 1, 0), velocity: vec(0, 0, 10), spin: vec(100, 0, 0) };
      const out = flight({ ...standardBall, spinDecay: decay }, spun, 1 / 240);
      expect(Number.isFinite(out.spin.x) && Number.isFinite(out.velocity.y)).toBe(true);
      expect(Math.abs(out.spin.x)).toBeLessThan(100);
    }
  });
});

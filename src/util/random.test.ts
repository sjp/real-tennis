import { describe, expect, it } from "vitest";
import { coinToss } from "../rules/match.ts";
import { seeded } from "./random.ts";

describe("seeded", () => {
  it("repeats for the same seed", () => {
    const a = seeded(42);
    const b = seeded(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it("balances the toss over small seeds", () => {
    let first = 0;
    for (let seed = 1; seed <= 100; seed++) if (coinToss(["a", "b"], seeded(seed)) === "a") first++;
    expect(first).toBeGreaterThanOrEqual(35);
    expect(first).toBeLessThanOrEqual(65);
  });

  it("stays in [0, 1) for negative and fractional seeds", () => {
    for (const seed of [-5, -1, 0, 0.5, 2.7, -3.2, 2 ** 40]) {
      const random = seeded(seed);
      for (let i = 0; i < 1000; i++) {
        const x = random();
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(1);
      }
    }
  });

  it("normalises the seed to a whole number", () => {
    expect(seeded(-5)()).toBe(seeded(5)());
    expect(seeded(2.7)()).toBe(seeded(2)());
  });

  it("decorrelates consecutive seeds", () => {
    // Second draws from seeds 1–100: their mean is near a half, not a ramp.
    const seconds = Array.from({ length: 100 }, (_, i) => {
      const random = seeded(i + 1);
      random();
      return random();
    });
    const mean = seconds.reduce((a, b) => a + b, 0) / seconds.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
    const rising = seconds.slice(1).filter((x, i) => x > seconds[i]!).length;
    expect(rising).toBeGreaterThan(30);
    expect(rising).toBeLessThan(70);
  });
});

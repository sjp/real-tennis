import { describe, expect, it } from "vitest";
import type { Athlete } from "../game/player.ts";
import { STEP } from "../sim/world.ts";
import { blendAthlete, blendPoint, blendTime, blendVec, PLAYER_JUMP } from "./blend.ts";

const athlete = (x: number, z: number, end: Athlete["end"] = "service"): Athlete => ({
  id: "p",
  motion: { position: { x, z }, velocity: { x: 6, z: 0 } },
  end,
  shot: "drive",
  serveStyle: 0,
  swing: null,
  serve: null,
  struck: null,
});

describe("blendPoint", () => {
  it("draws part way between steps", () => {
    expect(blendPoint({ x: 0, z: 0 }, { x: 0.02, z: -0.04 }, 0.25, 1)).toEqual({
      x: 0.005,
      z: -0.01,
    });
  });

  it("snaps to the latest after a jump too big for one step", () => {
    const b = { x: 3, z: 0 };
    expect(blendPoint({ x: 0, z: 0 }, b, 0.5, 1)).toBe(b);
  });
});

describe("blendVec", () => {
  it("draws part way between steps, or snaps on a jump", () => {
    expect(blendVec({ x: 0, y: 1, z: 0 }, { x: 0.1, y: 1.2, z: 0 }, 0.5, 1)).toEqual({
      x: 0.05,
      y: 1.1,
      z: 0,
    });
    const b = { x: 0, y: 1, z: 5 };
    expect(blendVec({ x: 0, y: 1, z: 0 }, b, 0.5, 1)).toBe(b);
  });
});

describe("blendTime", () => {
  it("ticks on between steps", () => {
    expect(blendTime(1, 1 + STEP, 0.5)).toBeCloseTo(1 + STEP / 2, 12);
  });

  it("takes the latest when the clock jumped, went back or stood still", () => {
    expect(blendTime(1, 5, 0.5)).toBe(5);
    expect(blendTime(5, 0, 0.5)).toBe(0);
    expect(blendTime(2, 2, 0.5)).toBe(2);
  });
});

describe("blendAthlete", () => {
  it("draws a running player between steps, keeping the rest of the latest state", () => {
    const next = { ...athlete(0.0275, 1), shot: "lob" as const };
    const drawn = blendAthlete(athlete(0, 1), next, 0.5);
    expect(drawn.motion.position.x).toBeCloseTo(0.01375, 12);
    expect(drawn.motion.position.z).toBe(1);
    expect(drawn.motion.velocity).toBe(next.motion.velocity);
    expect(drawn.shot).toBe("lob");
    expect(drawn.end).toBe("service");
  });

  it("snaps when a rest is set up and the player is put on their spot", () => {
    const next = athlete(1, -4);
    expect(blendAthlete(athlete(0, 1), next, 0.5)).toBe(next);
  });

  it("snaps on a change of ends, however near", () => {
    const next = athlete(0.01, 0, "hazard");
    expect(blendAthlete(athlete(0, 0, "service"), next, 0.5)).toBe(next);
  });

  it("moves no more than a step's run without snapping", () => {
    const step = 6.5 * STEP;
    expect(step).toBeLessThan(PLAYER_JUMP);
    const next = athlete(step, 0);
    expect(blendAthlete(athlete(0, 0), next, 0)).not.toBe(next);
  });

  it("is the latest with nothing before it, or at the end of the step", () => {
    const next = athlete(0.01, 0);
    expect(blendAthlete(undefined, next, 0.5)).toBe(next);
    expect(blendAthlete(athlete(0, 0), next, 1)).toBe(next);
  });
});

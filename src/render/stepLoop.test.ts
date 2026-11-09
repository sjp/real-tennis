import { describe, expect, it } from "vitest";
import { IDLE, type InputState } from "../input/input.ts";
import { STEP } from "../sim/world.ts";
import { advance, MAX_DELTA } from "./stepLoop.ts";

const swing: InputState = { ...IDLE, swing: true, select: 2 };

function run(acc: number, delta: number, isPaused = () => false) {
  const inputs: InputState[] = [];
  const left = advance(acc, delta, swing, isPaused, (i) => inputs.push(i));
  return { left, inputs };
}

describe("advance (210)", () => {
  it("takes whole steps, and keeps the remainder", () => {
    const { left, inputs } = run(0, 3.5 * STEP);
    expect(inputs).toHaveLength(3);
    expect(left).toBeCloseTo(0.5 * STEP);
    expect(run(left, 0.5 * STEP).inputs).toHaveLength(1);
  });

  it("counts a long frame as at most MAX_DELTA", () => {
    expect(run(0, 5).inputs).toHaveLength(Math.floor(MAX_DELTA / STEP + 1e-9));
  });

  it("takes no steps while paused", () => {
    const { left, inputs } = run(0, 0.05, () => true);
    expect(inputs).toEqual([]);
    expect(left).toBeCloseTo(0.05);
  });

  it("stops as soon as a step pauses play", () => {
    let paused = false;
    const n = { steps: 0 };
    advance(
      0,
      4 * STEP,
      IDLE,
      () => paused,
      () => {
        n.steps++;
        paused = true;
      },
    );
    expect(n.steps).toBe(1);
  });

  it("uses the swing and selection on the first step only", () => {
    const { inputs } = run(0, 3 * STEP + 1e-9);
    expect(inputs.map((i) => [i.swing, i.select])).toEqual([
      [true, 2],
      [false, null],
      [false, null],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { IDLE } from "./input.ts";
import { mergeInputs, STICK_RADIUS, touch } from "./touch.ts";

describe("touch", () => {
  it("moves by how far the thumb is from where it landed, up the screen being forwards", () => {
    const t = touch();
    t.stickStart(1, 100, 300);
    t.stickMove(1, 100 + STICK_RADIUS / 2, 300 - STICK_RADIUS / 2);
    const { move, sprint } = t.read();
    expect(move.x).toBeCloseTo(0.5);
    expect(move.y).toBeCloseTo(0.5);
    // The player always sprints (170).
    expect(sprint).toBe(true);
  });

  it("caps the move at full speed past the rim", () => {
    const t = touch();
    t.stickStart(1, 100, 300);
    t.stickMove(1, 100, 300 - STICK_RADIUS * 2);
    expect(t.read().move).toEqual({ x: 0, y: 1 });
  });

  it("ignores other fingers, and stops when the thumb lifts", () => {
    const t = touch();
    t.stickStart(1, 100, 300);
    t.stickMove(2, 400, 300);
    t.stickEnd(2);
    expect(t.stick()).not.toBeNull();
    t.stickEnd(1);
    expect(t.stick()).toBeNull();
    expect(t.read().move).toEqual({ x: 0, y: 0 });
  });

  it("lets go of everything on reset (200)", () => {
    const t = touch();
    t.stickStart(1, 100, 300);
    t.stickMove(1, 100, 200);
    t.swing();
    t.select(2);
    t.reset();
    expect(t.stick()).toBeNull();
    expect(t.read()).toMatchObject({ move: { x: 0, y: 0 }, swing: false, select: null });
  });

  it("keeps the stick on the first thumb when a second finger lands (200)", () => {
    const t = touch();
    t.stickStart(1, 100, 300);
    t.stickStart(2, 50, 50);
    t.stickEnd(2);
    expect(t.stick()?.origin).toEqual({ x: 100, y: 300 });
    t.stickMove(1, 100, 300 - STICK_RADIUS);
    expect(t.read().move).toEqual({ x: 0, y: 1 });
  });

  it("counts a press once", () => {
    const t = touch();
    t.swing();
    t.select(3);
    expect(t.read()).toMatchObject({ swing: true, select: 3 });
    expect(t.read()).toMatchObject({ swing: false, select: null });
  });
});

describe("mergeInputs", () => {
  it("takes the bigger move and either's presses", () => {
    const keys = { ...IDLE, move: { x: 1, y: 0 }, select: 2 };
    const thumb = { ...IDLE, move: { x: 0, y: 0.5 }, swing: true };
    expect(mergeInputs(keys, thumb)).toEqual({
      move: { x: 1, y: 0 },
      sprint: false,
      swing: true,
      select: 2,
    });
  });
});

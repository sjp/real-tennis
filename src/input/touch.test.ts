import { describe, expect, it } from "vitest";
import { IDLE } from "./input.ts";
import { mergeInputs, SPRINT_PAST, STICK_RADIUS, touch } from "./touch.ts";

describe("touch", () => {
  it("moves by how far the thumb is from where it landed, up the screen being forwards", () => {
    const t = touch();
    t.stickStart(1, 100, 300);
    t.stickMove(1, 100 + STICK_RADIUS / 2, 300 - STICK_RADIUS / 2);
    const { move, sprint } = t.read();
    expect(move.x).toBeCloseTo(0.5);
    expect(move.y).toBeCloseTo(0.5);
    expect(sprint).toBe(false);
  });

  it("caps the move at full speed, and sprints past the rim", () => {
    const t = touch();
    t.stickStart(1, 100, 300);
    t.stickMove(1, 100, 300 - STICK_RADIUS * 1.1);
    expect(t.read()).toMatchObject({ move: { x: 0, y: 1 }, sprint: false });
    t.stickMove(1, 100, 300 - STICK_RADIUS * (SPRINT_PAST + 0.1));
    expect(t.read()).toMatchObject({ move: { x: 0, y: 1 }, sprint: true });
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

  it("counts a press once, and holds sprint while the button is down", () => {
    const t = touch();
    t.swing();
    t.select(3);
    t.sprint(true);
    expect(t.read()).toMatchObject({ swing: true, select: 3, sprint: true });
    expect(t.read()).toMatchObject({ swing: false, select: null, sprint: true });
    t.sprint(false);
    expect(t.read().sprint).toBe(false);
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

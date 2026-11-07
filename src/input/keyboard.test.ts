import { describe, expect, it } from "vitest";
import { keyboard } from "./keyboard.ts";

const target = new EventTarget() as unknown as Window;
const key = (type: string, code: string) =>
  target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));

describe("keyboard", () => {
  it("turns keys into InputState, counting presses once", () => {
    const kb = keyboard(target);
    key("keydown", "KeyW");
    key("keydown", "KeyD");
    key("keydown", "Space");
    key("keydown", "Digit2");
    const first = kb.read();
    expect(first.move.x).toBeCloseTo(Math.SQRT1_2);
    expect(first.move.y).toBeCloseTo(Math.SQRT1_2);
    expect(first).toMatchObject({ swing: true, select: 2, sprint: true });
    expect(kb.read()).toMatchObject({ swing: false, select: null });
    key("keyup", "KeyW");
    expect(kb.read().move).toEqual({ x: 1, y: 0 });
    kb.dispose();
  });
});

import { describe, expect, it } from "vitest";
import { keyboard, withModifier } from "./keyboard.ts";

const target = new EventTarget() as unknown as Window;
const key = (type: string, code: string) =>
  target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
const visible: { visibilityState: DocumentVisibilityState } = { visibilityState: "visible" };
const doc = Object.assign(new EventTarget(), visible);

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

  it("lets go of held keys when the tab is hidden, or Cmd is released (202)", () => {
    const kb = keyboard(target, doc);
    key("keydown", "KeyW");
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(kb.read().move).toEqual({ x: 0, y: 0 });
    doc.visibilityState = "visible";
    key("keydown", "KeyA");
    key("keyup", "MetaLeft");
    expect(kb.read().move).toEqual({ x: 0, y: 0 });
    kb.dispose();
  });

  it("lets go of held keys when the window loses focus", () => {
    const kb = keyboard(target, doc);
    key("keydown", "KeyD");
    target.dispatchEvent(new Event("blur"));
    expect(kb.read().move).toEqual({ x: 0, y: 0 });
    kb.dispose();
  });

  it("picks shots and serves with 1 to 8, and nothing past them", () => {
    const kb = keyboard(target);
    for (const n of [1, 5, 6, 7, 8]) {
      key("keydown", `Digit${String(n)}`);
      expect(kb.read().select).toBe(n);
    }
    key("keydown", "Digit9");
    key("keydown", "Digit0");
    expect(kb.read().select).toBeNull();
    kb.dispose();
  });

  it("tells browser shortcuts from game keys (202)", () => {
    const none = { ctrlKey: false, metaKey: false, altKey: false };
    expect(withModifier(none)).toBe(false);
    expect(withModifier({ ...none, ctrlKey: true })).toBe(true);
    expect(withModifier({ ...none, metaKey: true })).toBe(true);
    expect(withModifier({ ...none, altKey: true })).toBe(true);
  });
});

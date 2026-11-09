import { describe, expect, it, vi } from "vitest";
import { createHud } from "./hud.ts";

describe("createHud", () => {
  it("notifies only when a value changes", () => {
    const hud = createHud({ a: 1, b: "x" });
    const heard = vi.fn<() => void>();
    const off = hud.subscribe(heard);
    const before = hud.get();
    hud.set({ a: 1 });
    hud.set({});
    expect(heard).not.toHaveBeenCalled();
    expect(hud.get()).toBe(before);
    hud.set({ a: 2 });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(hud.get()).toEqual({ a: 2, b: "x" });
    off();
    hud.set({ b: "y" });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("takes an update from the old state", () => {
    const hud = createHud({ n: 1 });
    hud.set((h) => ({ n: h.n + 1 }));
    hud.set((h) => ({ n: h.n * 10 }));
    expect(hud.get().n).toBe(20);
  });
});

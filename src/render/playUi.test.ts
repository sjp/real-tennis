import { describe, expect, it } from "vitest";
import { playKey } from "./playUi.ts";

const key = (code: string, more: Partial<Parameters<typeof playKey>[0]> = {}) => ({
  code,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...more,
});

describe("playKey", () => {
  it("maps the shared keys", () => {
    expect(playKey(key("Escape"), false)).toBe("menu");
    expect(playKey(key("Slash"), false)).toBe("rules");
    expect(playKey(key("KeyM"), false)).toBe("markings");
    expect(playKey(key("KeyX"), false)).toBe("explain");
    expect(playKey(key("KeyH"), false)).toBe("assist");
    expect(playKey(key("KeyW"), false)).toBeNull();
    expect(playKey(key("Space"), false)).toBeNull();
  });

  it("closes the rules on Esc rather than opening the menu", () => {
    expect(playKey(key("Escape"), true)).toBe("closeRules");
    expect(playKey(key("Slash"), true)).toBe("rules");
  });

  it("ignores held keys and browser shortcuts (202)", () => {
    expect(playKey(key("KeyM", { repeat: true }), false)).toBeNull();
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
      for (const code of ["Escape", "Slash", "KeyM", "KeyX", "KeyH"]) {
        expect(playKey(key(code, { [mod]: true }), false)).toBeNull();
      }
    }
    // ? is Shift and /, so Shift alone isn't a shortcut.
    const question = { ...key("Slash"), shiftKey: true };
    expect(playKey(question, false)).toBe("rules");
  });
});

import { describe, expect, it } from "vitest";
import { dismissKey, GRACE_MS } from "./dismissKeys.ts";

const space = { code: "Space", repeat: false };

describe("dismissKey (201)", () => {
  it("swallows Space pressed as the panel opens", () => {
    expect(dismissKey(space, 0)).toBe("swallow");
    expect(dismissKey(space, GRACE_MS - 1)).toBe("swallow");
  });

  it("dismisses on Space or Enter after the grace period", () => {
    expect(dismissKey(space, GRACE_MS)).toBe("dismiss");
    expect(dismissKey({ code: "Enter", repeat: false }, GRACE_MS + 1000)).toBe("dismiss");
  });

  it("leaves a held key and other keys alone", () => {
    expect(dismissKey({ ...space, repeat: true }, GRACE_MS + 1000)).toBe("ignore");
    expect(dismissKey({ code: "KeyH", repeat: false }, GRACE_MS + 1000)).toBe("ignore");
  });
});

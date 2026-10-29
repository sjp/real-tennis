import { describe, expect, it } from "vitest";
import { teach } from "../rules/teaching.ts";
import { advance, dismiss, explainer, heard, reset, toggle } from "./explain.ts";

describe("explainer", () => {
  it("waits for the end of the rest, then explains each new call once", () => {
    let e = heard(explainer(), [teach("goodService")]);
    e = advance(e, false);
    expect(e.showing).toBeNull();
    e = heard(e, [teach("goodService"), teach("chaseLaid", "Two")]);
    e = advance(e, true);
    expect(e.showing).toBe("goodService");
    e = advance(dismiss(e), true);
    expect(e.showing).toBe("chaseLaid");
    e = advance(heard(dismiss(e), [teach("goodService")]), true);
    expect(e.showing).toBeNull();
  });

  it("explains nothing while switched off", () => {
    let e = advance(heard(toggle(explainer()), [teach("dedans")]), true);
    expect(e.showing).toBeNull();
    e = advance(heard(toggle(e), [teach("dedans")]), true);
    expect(e.showing).toBe("dedans");
  });

  it("explains again after a reset", () => {
    const e = explainer(["dedans"]);
    expect(advance(heard(e, [teach("dedans")]), true).showing).toBeNull();
    expect(advance(heard(reset(e), [teach("dedans")]), true).showing).toBe("dedans");
  });
});

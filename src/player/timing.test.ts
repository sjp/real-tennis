import { describe, expect, it } from "vitest";
import { GOOD, grade, MAX_PULL, PERFECT, POOR } from "./timing.ts";

describe("grade", () => {
  it("grades by the windows", () => {
    expect(grade(0, false).grade).toBe("perfect");
    expect(grade(PERFECT, false).grade).toBe("perfect");
    expect(grade(-GOOD, false).grade).toBe("good");
    expect(grade(POOR, false).grade).toBe("poor");
    expect(grade(-POOR - 0.01, false).grade).toBe("miss");
  });

  it("puts a perfect swing on line at full quality", () => {
    expect(grade(0.02, false)).toMatchObject({ quality: 1, pull: 0 });
  });

  it("loses quality steadily the further off perfect", () => {
    const q = [0, 0.04, 0.06, 0.09, 0.12, 0.15].map((e) => grade(e, false).quality);
    for (let i = 1; i < q.length; i++) expect(q[i]).toBeLessThan(q[i - 1]!);
    expect(grade(-0.06, false).quality).toBeCloseTo(grade(0.06, false).quality);
    expect(q.at(-1)).toBeGreaterThan(0);
  });

  it("pulls early forehands left and pushes late ones right", () => {
    expect(grade(0.1, false).pull).toBeGreaterThan(0);
    expect(grade(-0.1, false).pull).toBeLessThan(0);
    expect(grade(POOR, false).pull).toBeCloseTo(MAX_PULL);
  });

  it("mirrors the pull on the backhand", () => {
    expect(grade(0.1, true).pull).toBeCloseTo(-grade(0.1, false).pull);
  });
});

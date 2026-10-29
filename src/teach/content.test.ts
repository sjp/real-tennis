import { describe, expect, it } from "vitest";
import { featureName, featureShape } from "../court/features.ts";
import { standardCourt as court } from "../court/standard.ts";
import { TEACHING, type TeachingId } from "../rules/teaching.ts";
import { EXPLANATIONS } from "./content.ts";

const ids = Object.keys(TEACHING) as TeachingId[];

describe("teaching content", () => {
  it.each(ids)("explains %s", (id) => {
    const e = EXPLANATIONS[id];
    expect(e.title).not.toBe("");
    expect(e.text.split(/[.!?]\s/).length).toBeLessThanOrEqual(4);
  });

  it("has nothing for calls that don't exist", () => {
    expect(Object.keys(EXPLANATIONS).toSorted()).toEqual(ids.toSorted());
  });

  it.each(ids.filter((id) => EXPLANATIONS[id].feature))("can show the feature for %s", (id) => {
    const f = EXPLANATIONS[id].feature!;
    expect(featureShape(court, f).polygons.length).toBeGreaterThan(0);
    expect(featureName(court, f)).not.toBe("");
  });
});

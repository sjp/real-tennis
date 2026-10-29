import { describe, expect, it } from "vitest";
import { featureShape } from "../court/features.ts";
import { standardCourt as court } from "../court/standard.ts";
import { ENTRIES, TOPICS } from "./reference.ts";

describe("rules reference", () => {
  it("has entries for every topic, with unique ids", () => {
    for (const t of TOPICS) expect(ENTRIES.some((e) => e.topic === t.id)).toBe(true);
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
  });

  it.each(ENTRIES)("$id cites a Law", (e) => {
    expect(e.laws).toMatch(/\d/);
    expect(e.paragraphs.length).toBeGreaterThan(0);
  });

  it.each(ENTRIES.filter((e) => e.feature))("$id can show its feature", (e) => {
    expect(featureShape(court, e.feature!).polygons.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { EXPLANATIONS } from "./content.ts";
import { LESSONS } from "./lessons.ts";
import { word } from "./wording.ts";

const texts = [
  ...LESSONS.flatMap((l) => [...l.intro, l.goal, l.success]),
  ...Object.values(EXPLANATIONS).flatMap((e) => [e.text, e.tip ?? ""]),
];

describe("word", () => {
  it("words every phrase in the teaching text for both keys and touch", () => {
    for (const t of texts)
      for (const controls of ["keys", "touch"] as const)
        expect(word(t, controls)).not.toMatch(/[{}]/);
  });

  it("names no keys on touch", () => {
    for (const t of texts)
      expect(word(t, "touch")).not.toMatch(/\b(Space|WASD|Shift|Keys? \d)\b|\([1-8S]\)/);
  });
});

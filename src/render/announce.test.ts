import { describe, expect, it } from "vitest";
import { createAnnouncer, sentence } from "./announce.ts";

describe("sentence", () => {
  it("joins the parts as sentences, leaving out empty ones", () => {
    expect(sentence(["Point to Player", null, "Fifteen–love. ", ""])).toBe(
      "Point to Player. Fifteen–love",
    );
  });
});

describe("createAnnouncer", () => {
  it("numbers each announcement, so the same words are said again", () => {
    const a = createAnnouncer();
    a.say("Fault");
    a.say("Fault");
    expect(a.get()).toEqual([
      { n: 1, text: "Fault" },
      { n: 2, text: "Fault" },
    ]);
  });

  it("keeps the last three, and ignores nothing to say", () => {
    const a = createAnnouncer();
    let heard = 0;
    a.subscribe(() => {
      heard += 1;
    });
    for (const t of ["a", "b", "c", "d"]) a.say(t);
    a.say(null, "");
    expect(a.get().map((s) => s.text)).toEqual(["b", "c", "d"]);
    expect(heard).toBe(4);
  });
});

import { describe, expect, it } from "vitest";
import type { SimEvent } from "../sim/events.ts";
import { soundOf, type Ear } from "./sounds.ts";

/** Facing +z, so the right is −x. */
const ear: Ear = { position: { x: 0, y: 2, z: -10 }, right: { x: -1, y: 0, z: 0 } };
const at = (x: number, z: number) => ({
  time: 0,
  position: { x, y: 1, z },
  surface: "floor" as const,
});

describe("soundOf", () => {
  it("makes a cut duller than a drive", () => {
    const hit: SimEvent = { ...at(0, -8), surface: "racket", type: "racketHit", player: "a" };
    const cut = soundOf(hit, 25, ear, "cut")!;
    const drive = soundOf(hit, 25, ear, "drive")!;
    expect(cut.kind).toBe("racket");
    expect(cut.bright).toBeLessThan(drive.bright);
  });

  it("is louder for a faster ball and quieter further away", () => {
    const near: SimEvent = { ...at(0, -8), type: "floorBounce", bounce: 1 };
    const far: SimEvent = { ...at(0, 20), type: "floorBounce", bounce: 1 };
    expect(soundOf(near, 15, ear)!.gain).toBeGreaterThan(soundOf(near, 5, ear)!.gain);
    expect(soundOf(near, 15, ear)!.gain).toBeGreaterThan(soundOf(far, 15, ear)!.gain);
  });

  it("drops sounds too quiet to hear", () => {
    expect(soundOf({ ...at(0, 20), type: "floorBounce", bounce: 5 }, 0.2, ear)).toBeNull();
  });

  it("pans to the side the event is on", () => {
    const right: SimEvent = { ...at(-4, -8), type: "wallHit" };
    const left: SimEvent = { ...at(4, -8), type: "wallHit" };
    expect(soundOf(right, 10, ear)!.pan).toBeGreaterThan(0);
    expect(soundOf(left, 10, ear)!.pan).toBeLessThan(0);
  });

  it("gives each opening its sound, and leaves silent events silent", () => {
    const into = (opening: "dedans" | "grille" | "winningGallery" | "lastGallery") =>
      soundOf({ ...at(0, 10), type: "enteredOpening", opening }, 1, ear)?.kind;
    expect(into("dedans")).toBe("netting");
    expect(into("lastGallery")).toBe("netting");
    expect(into("grille")).toBe("grille");
    expect(into("winningGallery")).toBe("bell");
    expect(soundOf({ ...at(0, 0), type: "netCrossed", from: "service" }, 20, ear)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { SimEvent } from "../sim/events.ts";
import { cameraStart, describeEvent, describeNotice } from "./view.ts";

const at = { time: 0, position: { x: 0, y: 0, z: 0 }, surface: "floor" } as const;
const ev = (e: Record<string, unknown>) => ({ ...at, ...e }) as SimEvent;

describe("describeNotice", () => {
  it("describes strokes, and leaves faults to the rules engine", () => {
    expect(describeNotice({ type: "whiff" })).toEqual({ last: "Missed it" });
    expect(describeNotice({ type: "serverFault", reason: "line" })).toEqual({});
    const timing = { grade: "perfect", error: 0.004, quality: 1, pull: 0 } as const;
    expect(describeNotice({ type: "shot", shot: "Railroad", timing })).toEqual({
      last: "Railroad: perfect",
      event: null,
    });
    expect(
      describeNotice({
        type: "shot",
        shot: "drive",
        timing: { ...timing, grade: "good", error: 0.0456 },
      }).last,
    ).toBe("drive: good · early 46 ms");
    expect(
      describeNotice({
        type: "shot",
        shot: "drive",
        timing: { ...timing, grade: "poor", error: -0.15 },
      }).last,
    ).toBe("drive: poor · late 150 ms");
  });
});

describe("describeEvent", () => {
  it("names the events worth showing", () => {
    expect(describeEvent(ev({ type: "enteredOpening", opening: "dedans" }))).toBe(
      "Into the Dedans",
    );
    expect(describeEvent(ev({ type: "outOfCourt" }))).toBe("Out of court");
    expect(describeEvent(ev({ type: "playerHit", player: "human" }))).toBe("The ball hit you");
    expect(describeEvent(ev({ type: "playerHit", player: "ai" }))).toBe(
      "The ball hit your opponent",
    );
    expect(describeEvent(ev({ type: "netHit", face: "service", cord: true }))).toBe(
      "Off the net cord",
    );
    expect(describeEvent(ev({ type: "netHit", face: "hazard", cord: false }))).toBe("Into the net");
  });

  it("ignores the rest", () => {
    expect(describeEvent(ev({ type: "floorBounce", bounce: 1 }))).toBeNull();
    expect(describeEvent(ev({ type: "wallHit" }))).toBeNull();
  });
});

describe("cameraStart", () => {
  it("sits behind the player, looking towards the other end", () => {
    const [x, y, z] = cameraStart({ x: 1, z: 4 }, "service");
    expect([x, z]).toEqual([1, -1]);
    expect(y).toBeGreaterThan(2);
    expect(cameraStart({ x: 1, z: -4 }, "hazard")[2]).toBe(1);
  });
});

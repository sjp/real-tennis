import { describe, expect, it } from "vitest";
import { classifyFloorPoint, faultLineX, openingAt, serviceLineZ } from "./classify.ts";
import { standardCourt as court } from "./standard.ts";

const hl = court.floor.length / 2;
const lineZ = serviceLineZ(court);

describe("classifyFloorPoint", () => {
  it("puts the Dedans end on the service side, measuring chases from the Dedans wall", () => {
    const c = classifyFloorPoint(court, { x: 0, z: -hl + 2 });
    expect(c.side).toBe("service");
    expect(c.chaseMark?.side).toBe("service");
    expect(c.chaseMark?.distance).toBeCloseTo(2);
  });

  it("measures hazard chases from the Service Line towards the net (Law 6(b))", () => {
    const c = classifyFloorPoint(court, { x: 0, z: lineZ - 1 });
    expect(c.inHazardCourt).toBe(true);
    expect(c.chaseMark).toEqual({ side: "hazard", distance: 1 });
  });

  it("counts a Fall on the Service Line as beyond it (Law 11.1(b))", () => {
    const c = classifyFloorPoint(court, { x: 0, z: lineZ - court.lineWidth / 2 });
    expect(c.beyondServiceLine).toBe(true);
    expect(c.inHazardCourt).toBe(false);
    expect(c.chaseMark).toBeNull();
  });

  it("includes the Fault Line in the Service Court (Law 2)", () => {
    const z = lineZ + 1;
    expect(classifyFloorPoint(court, { x: faultLineX(court), z }).inServiceCourt).toBe(true);
    expect(classifyFloorPoint(court, { x: faultLineX(court) - 0.1, z }).inServiceCourt).toBe(false);
    expect(classifyFloorPoint(court, { x: court.floor.width / 2 - 0.1, z }).inServiceCourt).toBe(
      true,
    );
  });
});

describe("openingAt", () => {
  const winningGallery = court.openings.find((o) => o.id === "winningGallery")!;
  const secondGallery = court.openings.find((o) => o.id === "hazardSecondGallery")!;
  const mid = (a: number, b: number) => (a + b) / 2;

  it("finds the gallery a contact enters", () => {
    const r = winningGallery.rect;
    expect(openingAt(court, { wall: "side", u: mid(r.u0, r.u1), y: mid(r.y0, r.y1) })?.id).toBe(
      "winningGallery",
    );
  });

  it("gives a Gallery Post to the gallery nearer the net (Law 2)", () => {
    // The post between the Winning Gallery and Hazard the Second Gallery.
    const p = secondGallery.post!;
    expect(p.u0).toBeLessThan(winningGallery.rect.u0);
    expect(openingAt(court, { wall: "side", u: mid(p.u0, p.u1), y: mid(p.y0, p.y1) })?.id).toBe(
      "hazardSecondGallery",
    );
  });

  it("finds the Dedans and the Grille on their own walls only", () => {
    for (const id of ["dedans", "grille"] as const) {
      const { wall, rect: r } = court.openings.find((o) => o.id === id)!;
      const c = { u: mid(r.u0, r.u1), y: mid(r.y0, r.y1) };
      expect(openingAt(court, { wall, ...c })?.id).toBe(id);
      expect(
        openingAt(court, { wall: wall === "dedans" ? "grille" : "dedans", ...c }),
      ).toBeUndefined();
      expect(openingAt(court, { wall, u: c.u, y: r.y0 - 0.01 })).toBeUndefined();
    }
  });

  it("finds nothing below the gallery sill", () => {
    const r = winningGallery.rect;
    expect(openingAt(court, { wall: "side", u: mid(r.u0, r.u1), y: r.y0 / 2 })).toBeUndefined();
  });

  it("lists the galleries in Law 2 order from the net", () => {
    const fromNet = (side: string) =>
      court.openings
        .filter((o) => o.wall === "side" && o.side === side)
        .toSorted((a, b) => Math.abs(a.rect.u0 + a.rect.u1) - Math.abs(b.rect.u0 + b.rect.u1))
        .map((o) => o.id);
    expect(fromNet("service")).toEqual([
      "lineOpening",
      "firstGallery",
      "door",
      "secondGallery",
      "lastGallery",
    ]);
    expect(fromNet("hazard")).toEqual([
      "hazardLineOpening",
      "hazardFirstGallery",
      "hazardDoor",
      "hazardSecondGallery",
      "winningGallery",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { featureName, featureShape, markZ, type CourtFeature } from "./features.ts";
import { serviceLineZ } from "./classify.ts";
import { standardCourt as court } from "./standard.ts";

const FEATURES: readonly CourtFeature[] = [
  "net",
  "mainWall",
  "sideWall",
  "serviceWall",
  "tambour",
  "dedansPenthouse",
  "sidePenthouse",
  "servicePenthouse",
  "grillePenthouse",
  "grilleEnd",
  "outOfCourt",
  "serviceLine",
  "faultLine",
  "secondGalleryLine",
  "serviceCourt",
  "hazardCourt",
  "pass",
  "serviceEnd",
  "hazardEnd",
  "chaseLines",
  "hazardChaseLines",
  "galleries",
  ...court.openings.map((o) => `opening:${o.id}` as const),
];

describe("court features", () => {
  it.each(FEATURES)("%s has a shape and a name", (f) => {
    const { polygons, label } = featureShape(court, f);
    expect(polygons.length).toBeGreaterThan(0);
    expect(Number.isFinite(label.x + label.y + label.z)).toBe(true);
    expect(featureName(court, f)).not.toBe("");
  });

  it("puts the Service Court beyond the Service Line, by the Side Wall", () => {
    const { label } = featureShape(court, "serviceCourt");
    expect(label.z).toBeGreaterThan(serviceLineZ(court));
    expect(label.x).toBeGreaterThan(0);
  });

  it("draws the net across the court in its plane, from the floor to its height", () => {
    const hw = court.floor.width / 2;
    const { polygons, label } = featureShape(court, "net");
    const vs = polygons.flatMap((p) => p.vertices);
    expect(vs.every((v) => v.z === 0)).toBe(true);
    expect(Math.min(...vs.map((v) => v.x))).toBe(-hw);
    expect(Math.max(...vs.map((v) => v.x))).toBe(hw);
    expect(Math.min(...vs.map((v) => v.y))).toBe(0);
    const top = Math.max(...vs.map((v) => v.y));
    expect(top).toBeGreaterThanOrEqual(court.net.centreHeight);
    expect(top).toBeLessThanOrEqual(court.net.endHeight);
    expect(label.x).toBeCloseTo(0);
    expect(label.z).toBe(0);
  });

  it("measures chase marks from each side's reference", () => {
    expect(markZ(court, { side: "service", distance: 1 })).toBeCloseTo(1 - court.floor.length / 2);
    expect(markZ(court, { side: "hazard", distance: 1 })).toBeCloseTo(serviceLineZ(court) - 1);
  });
});

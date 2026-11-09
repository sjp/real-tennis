import { describe, expect, it } from "vitest";
import { featureName, featureShape, markZ, type CourtFeature } from "./features.ts";
import { serviceLineZ } from "./classify.ts";
import { netHeightAt } from "./collision.ts";
import { standardCourt as court } from "./standard.ts";

// Every feature but the openings: a new one won't compile until it's listed here.
const ALL = {
  net: true,
  mainWall: true,
  sideWall: true,
  serviceWall: true,
  tambour: true,
  dedansPenthouse: true,
  sidePenthouse: true,
  servicePenthouse: true,
  grillePenthouse: true,
  grilleEnd: true,
  outOfCourt: true,
  serviceLine: true,
  faultLine: true,
  secondGalleryLine: true,
  serviceCourt: true,
  hazardCourt: true,
  pass: true,
  serviceEnd: true,
  hazardEnd: true,
  chaseLines: true,
  hazardChaseLines: true,
  galleries: true,
} as const satisfies Record<Exclude<CourtFeature, `opening:${string}`>, true>;

const FEATURES: readonly CourtFeature[] = [
  ...(Object.keys(ALL) as (keyof typeof ALL)[]),
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
    // Its top follows the cord's sag, from the centre to the walls (195).
    for (const v of vs.filter((v) => v.y > 0)) expect(v.y).toBeCloseTo(netHeightAt(court, v.x));
    expect(Math.max(...vs.map((v) => v.y))).toBeCloseTo(court.net.endHeight);
    expect(Math.min(...vs.filter((v) => v.y > 0).map((v) => v.y))).toBeCloseTo(
      court.net.centreHeight,
    );
    expect(label.x).toBeCloseTo(0);
    expect(label.z).toBe(0);
  });

  it("measures chase marks from each side's reference", () => {
    expect(markZ(court, { side: "service", distance: 1 })).toBeCloseTo(1 - court.floor.length / 2);
    expect(markZ(court, { side: "hazard", distance: 1 })).toBeCloseTo(serviceLineZ(court) - 1);
  });
});

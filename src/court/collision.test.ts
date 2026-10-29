import { describe, expect, it } from "vitest";
import { collisionGeometry, netHeightAt, tileAround, type CollisionPolygon } from "./collision.ts";
import { standardCourt as court } from "./standard.ts";
import type { Vec3 } from "./types.ts";

const prims = collisionGeometry(court);
const polygons = prims.filter((p): p is CollisionPolygon => p.kind === "polygon");
const sub = (a: Vec3, b: Vec3) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

describe("collisionGeometry", () => {
  it("makes flat polygons with unit normals", () => {
    for (const p of polygons) {
      expect(Math.hypot(p.normal.x, p.normal.y, p.normal.z)).toBeCloseTo(1);
      for (const v of p.vertices) expect(dot(sub(v, p.vertices[0]!), p.normal)).toBeCloseTo(0);
    }
  });

  it("faces every surface into the court", () => {
    const inside = { x: 0, y: 3, z: 0 };
    const backwards = polygons
      .filter((p) => !p.surface.startsWith("joue:"))
      .filter((p) => dot(sub(inside, p.vertices[0]!), p.normal) <= 0)
      .map((p) => p.surface);
    expect(backwards).toEqual([]);
  });

  it("has one sensor per opening", () => {
    const sensors = prims.filter((p) => p.kind === "opening").map((p) => p.opening);
    expect(sensors.toSorted()).toEqual(court.openings.map((o) => o.id).toSorted());
  });

  it("splits the Side Penthouse into the Service Penthouse at the net (Law 2)", () => {
    const service = polygons.find((p) => p.surface === "penthouse:service")!;
    expect(Math.min(...service.vertices.map((v) => v.z))).toBe(0);
    const edges = prims.filter((p) => p.kind === "segment").map((p) => p.surface);
    expect(edges).toContain("penthouseEdge:service");
    expect(edges).toContain("penthouseEdge:side");
  });

  it("gives joues to the Dedans, Grille, Last and Winning Galleries", () => {
    const joues = new Set(
      polygons.filter((p) => p.surface.startsWith("joue:")).map((p) => p.surface),
    );
    expect([...joues].toSorted()).toEqual([
      "joue:dedans",
      "joue:grille",
      "joue:lastGallery",
      "joue:winningGallery",
    ]);
  });
});

describe("netHeightAt", () => {
  it("is 0.91 m in the centre and 1.52 m at each end (Law 5)", () => {
    const hw = court.floor.width / 2;
    expect(netHeightAt(court, 0)).toBeCloseTo(0.914, 3);
    expect(netHeightAt(court, -hw)).toBeCloseTo(1.524, 3);
    expect(netHeightAt(court, hw)).toBeCloseTo(1.524, 3);
  });
});

describe("tileAround", () => {
  it("covers the area outside the holes exactly", () => {
    const outer = { u0: 0, u1: 10, y0: 0, y1: 4 };
    const holes = [
      { u0: 2, u1: 4, y0: 1, y1: 3 },
      { u0: 6, u1: 7, y0: 1, y1: 3 },
    ];
    const area = tileAround(outer, holes).reduce((a, r) => a + (r.u1 - r.u0) * (r.y1 - r.y0), 0);
    expect(area).toBeCloseTo(40 - 4 - 2);
  });
});

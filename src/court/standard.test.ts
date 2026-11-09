import { describe, expect, it } from "vitest";
import { serviceLineZ } from "./classify.ts";
import { collisionGeometry } from "./collision.ts";
import { markZ } from "./features.ts";
import { standardCourt as court } from "./standard.ts";
import type { Vec3, WallId, WallRect } from "./types.ts";

const hw = court.floor.width / 2;
const hl = court.floor.length / 2;
const below = court.penthouses.edgeHeight - court.penthouses.bandeauHeight;

/** Each wall's extent below the bandeau, in its own u and height. */
const walls: Record<WallId, WallRect> = {
  main: { u0: -hl, u1: hl, y0: 0, y1: below },
  side: { u0: -hl, u1: hl, y0: 0, y1: below },
  dedans: { u0: -hw, u1: hw, y0: 0, y1: below },
  grille: { u0: -hw + court.tambour.projection, u1: hw, y0: 0, y1: below },
};

const overlap = (a: WallRect, b: WallRect) =>
  Math.min(a.u1, b.u1) > Math.max(a.u0, b.u0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

const parts = court.openings.flatMap((o) => [
  { id: o.id, wall: o.wall, r: o.rect },
  ...(o.post ? [{ id: `${o.id} post`, wall: o.wall, r: o.post }] : []),
]);

describe("standardCourt", () => {
  it("has no overlapping openings or posts", () => {
    const clashes = parts.flatMap((a, i) =>
      parts
        .slice(i + 1)
        .filter((b) => a.wall === b.wall && overlap(a.r, b.r))
        .map((b) => `${a.id} / ${b.id}`),
    );
    expect(clashes).toEqual([]);
  });

  it("keeps every opening and post within its wall", () => {
    const outside = parts
      .filter(({ wall, r }) => {
        const w = walls[wall];
        return r.u0 < w.u0 || r.u1 > w.u1 || r.y0 < w.y0 || r.y1 > w.y1;
      })
      .map((p) => p.id);
    expect(outside).toEqual([]);
    for (const { r } of parts) {
      expect(r.u1).toBeGreaterThan(r.u0);
      expect(r.y1).toBeGreaterThan(r.y0);
    }
  });

  it("lists each side's chase lines in order from its reference, on its own side", () => {
    for (const side of ["service", "hazard"] as const) {
      const ds = court.chaseLines.filter((l) => l.side === side).map((l) => l.distance);
      expect(ds).toEqual(ds.toSorted((a, b) => a - b));
      expect(new Set(ds).size).toBe(ds.length);
      // The service side runs from the Dedans wall to the net; the hazard
      // chases from the net to the Service Line.
      const [lo, hi] = side === "service" ? [-hl, 0] : [0, serviceLineZ(court)];
      const astray = ds.filter((distance) => {
        const z = markZ(court, { side, distance });
        return !(z > lo && z < hi);
      });
      expect(astray).toEqual([]);
    }
  });

  it("has collision polygons with area and segments with length", () => {
    const area = (vs: readonly Vec3[]) => {
      // Newell's method: half the length of the summed cross products.
      let x = 0;
      let y = 0;
      let z = 0;
      vs.forEach((a, i) => {
        const b = vs[(i + 1) % vs.length]!;
        x += a.y * b.z - a.z * b.y;
        y += a.z * b.x - a.x * b.z;
        z += a.x * b.y - a.y * b.x;
      });
      return Math.hypot(x, y, z) / 2;
    };
    const flat: string[] = [];
    for (const p of collisionGeometry(court)) {
      if (p.kind === "polygon" || p.kind === "opening") {
        if (!(area(p.vertices) > 1e-6)) flat.push(p.kind === "polygon" ? p.surface : p.opening);
      } else if (p.kind === "segment") {
        const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y, p.b.z - p.a.z);
        if (!(len > 1e-6)) flat.push(p.surface);
      } else if (!(p.x1 > p.x0)) {
        flat.push(p.surface);
      }
    }
    expect(flat).toEqual([]);
  });
});

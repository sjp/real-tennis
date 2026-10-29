import type { CourtDefinition, OpeningId, Vec3, WallId, WallRect } from "./types.ts";

/**
 * Surfaces the ball can touch. The rules engine uses these ids, e.g. for the
 * service faults in Law 8.1(d).
 */
export type SurfaceId =
  | "floor"
  | "mainWall"
  | "sideWall"
  | "dedansWall"
  | "grilleWall"
  /** The wall above the Side Penthouse (Law 2). */
  | "serviceWall"
  | "highBackWall:dedans"
  | "highBackWall:grille"
  | "bandeau:dedans"
  | "bandeau:side"
  | "bandeau:grille"
  | "penthouse:dedans"
  /** The service-side part of the Side Penthouse. */
  | "penthouse:side"
  /** The hazard-side part of the Side Penthouse, from the net (Law 2). */
  | "penthouse:service"
  | "penthouse:grille"
  | "penthouseEdge:dedans"
  | "penthouseEdge:side"
  | "penthouseEdge:service"
  | "penthouseEdge:grille"
  | "tambour"
  | "net"
  | "netPost"
  | "outOfCourt"
  | `post:${OpeningId}`
  | `joue:${OpeningId}`;

/** A flat convex polygon. `normal` faces into the court. */
export interface CollisionPolygon {
  readonly kind: "polygon";
  readonly surface: SurfaceId;
  readonly vertices: readonly Vec3[];
  readonly normal: Vec3;
}

/** An edge the ball can strike, e.g. a penthouse edge or a post corner. */
export interface CollisionSegment {
  readonly kind: "segment";
  readonly surface: SurfaceId;
  readonly a: Vec3;
  readonly b: Vec3;
}

/** The net, in the plane z = 0. Its height follows `netHeightAt`. */
export interface CollisionNet {
  readonly kind: "net";
  readonly surface: "net";
  readonly x0: number;
  readonly x1: number;
}

/** Crossing this polygon, against its normal, means entering the opening. */
export interface OpeningSensor {
  readonly kind: "opening";
  readonly opening: OpeningId;
  readonly vertices: readonly Vec3[];
  readonly normal: Vec3;
}

export type CollisionPrimitive = CollisionPolygon | CollisionSegment | CollisionNet | OpeningSensor;

/** Net height at x: a parabolic sag from the ends to the centre. */
export function netHeightAt(court: CourtDefinition, x: number): number {
  const { centreHeight, endHeight } = court.net;
  const t = x / (court.floor.width / 2);
  return centreHeight + (endHeight - centreHeight) * t * t;
}

interface WallFrame {
  /** The point at (u, y) in the wall plane, or `depth` behind it. */
  readonly at: (u: number, y: number, depth?: number) => Vec3;
  readonly normal: Vec3;
}

function wallFrame(court: CourtDefinition, wall: WallId): WallFrame {
  const hw = court.floor.width / 2;
  const hl = court.floor.length / 2;
  switch (wall) {
    case "main":
      return { at: (u, y, d = 0) => ({ x: -hw - d, y, z: u }), normal: { x: 1, y: 0, z: 0 } };
    case "side":
      return { at: (u, y, d = 0) => ({ x: hw + d, y, z: u }), normal: { x: -1, y: 0, z: 0 } };
    case "dedans":
      return { at: (u, y, d = 0) => ({ x: u, y, z: -hl - d }), normal: { x: 0, y: 0, z: 1 } };
    case "grille":
      return { at: (u, y, d = 0) => ({ x: u, y, z: hl + d }), normal: { x: 0, y: 0, z: -1 } };
  }
}

function rectVertices(frame: WallFrame, r: WallRect, depth = 0): Vec3[] {
  return [
    frame.at(r.u0, r.y0, depth),
    frame.at(r.u1, r.y0, depth),
    frame.at(r.u1, r.y1, depth),
    frame.at(r.u0, r.y1, depth),
  ];
}

function rectPolygon(frame: WallFrame, r: WallRect, surface: SurfaceId): CollisionPolygon {
  return { kind: "polygon", surface, vertices: rectVertices(frame, r), normal: frame.normal };
}

/** Splits `outer` into rectangles that avoid every hole. */
export function tileAround(outer: WallRect, holes: readonly WallRect[]): WallRect[] {
  const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const us = new Set([outer.u0, outer.u1]);
  const ys = new Set([outer.y0, outer.y1]);
  for (const h of holes) {
    us.add(clip(h.u0, outer.u0, outer.u1)).add(clip(h.u1, outer.u0, outer.u1));
    ys.add(clip(h.y0, outer.y0, outer.y1)).add(clip(h.y1, outer.y0, outer.y1));
  }
  const su = [...us].toSorted((a, b) => a - b);
  const sy = [...ys].toSorted((a, b) => a - b);
  const cells: WallRect[] = [];
  for (let j = 0; j < sy.length - 1; j++) {
    // Merge each row's free cells into runs.
    let run: WallRect | null = null;
    for (let i = 0; i < su.length - 1; i++) {
      const cell = { u0: su[i]!, u1: su[i + 1]!, y0: sy[j]!, y1: sy[j + 1]! };
      const cu = (cell.u0 + cell.u1) / 2;
      const cy = (cell.y0 + cell.y1) / 2;
      const blocked = holes.some((h) => cu > h.u0 && cu < h.u1 && cy > h.y0 && cy < h.y1);
      if (blocked) {
        if (run) cells.push(run);
        run = null;
      } else {
        run = run === null ? cell : { u0: run.u0, u1: cell.u1, y0: run.y0, y1: run.y1 };
      }
    }
    if (run) cells.push(run);
  }
  return cells.filter((c) => c.u1 > c.u0 && c.y1 > c.y0);
}

const WALL_SURFACE = {
  main: "mainWall",
  side: "sideWall",
  dedans: "dedansWall",
  grille: "grilleWall",
} as const satisfies Record<WallId, SurfaceId>;

/** The court's collision geometry, consumed by the physics sim. */
export function collisionGeometry(court: CourtDefinition): CollisionPrimitive[] {
  const out: CollisionPrimitive[] = [];
  const { floor, penthouses: p, height, tambour } = court;
  const hw = floor.width / 2;
  const hl = floor.length / 2;
  const { dedans: dd, side: ds, grille: dg } = p.depth;
  const e = p.edgeHeight;
  const w = p.wallHeight;
  const below = e - p.bandeauHeight;
  const poly = (surface: SurfaceId, vertices: Vec3[], normal: Vec3) =>
    out.push({ kind: "polygon", surface, vertices, normal });
  const seg = (surface: SurfaceId, a: Vec3, b: Vec3) =>
    out.push({ kind: "segment", surface, a, b });
  const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

  poly("floor", [v(-hw, 0, -hl), v(-hw, 0, hl), v(hw, 0, hl), v(hw, 0, -hl)], v(0, 1, 0));

  // Walls below the penthouses, with their openings, posts and joues.
  const netPost: WallRect = {
    u0: -court.net.postWidth / 2,
    u1: court.net.postWidth / 2,
    y0: 0,
    y1: below,
  };
  const lowerWalls: [WallId, WallRect][] = [
    ["side", { u0: -hl, u1: hl, y0: 0, y1: below }],
    ["dedans", { u0: -hw, u1: hw, y0: 0, y1: below }],
    ["grille", { u0: -hw + tambour.projection, u1: hw, y0: 0, y1: below }],
  ];
  for (const [wall, outer] of lowerWalls) {
    const frame = wallFrame(court, wall);
    const openings = court.openings.filter((o) => o.wall === wall);
    const special: [WallRect, SurfaceId][] = openings.flatMap((o) =>
      o.post ? [[o.post, `post:${o.id}` as const]] : [],
    );
    if (wall === "side") special.push([netPost, "netPost"]);
    const holes = [...openings.map((o) => o.rect), ...special.map(([r]) => r)];
    for (const r of tileAround(outer, holes)) out.push(rectPolygon(frame, r, WALL_SURFACE[wall]));
    for (const [r, surface] of special) {
      out.push(rectPolygon(frame, r, surface));
      seg(surface, frame.at(r.u0, r.y0), frame.at(r.u0, r.y1));
      seg(surface, frame.at(r.u1, r.y0), frame.at(r.u1, r.y1));
    }
    for (const o of openings) {
      const r = o.rect;
      for (const end of o.joues) {
        const u = r[end];
        const inward = end === "u0" ? 1 : -1;
        const along = wall === "side" ? v(0, 0, inward) : v(inward, 0, 0);
        poly(
          `joue:${o.id}`,
          [
            frame.at(u, r.y0),
            frame.at(u, r.y0, o.depth),
            frame.at(u, r.y1, o.depth),
            frame.at(u, r.y1),
          ],
          along,
        );
      }
      out.push({
        kind: "opening",
        opening: o.id,
        vertices: rectVertices(frame, r, o.depth),
        normal: frame.normal,
      });
    }
  }

  // Bandeaux.
  out.push(
    rectPolygon(wallFrame(court, "side"), { u0: -hl, u1: hl, y0: below, y1: e }, "bandeau:side"),
  );
  out.push(
    rectPolygon(
      wallFrame(court, "dedans"),
      { u0: -hw, u1: hw, y0: below, y1: e },
      "bandeau:dedans",
    ),
  );
  out.push(
    rectPolygon(
      wallFrame(court, "grille"),
      { u0: -hw + tambour.projection, u1: hw, y0: below, y1: e },
      "bandeau:grille",
    ),
  );

  // Penthouse roofs, meeting in hips at the corners.
  const rise = w - e;
  const roofNormal = (dx: number, dz: number, depth: number) => {
    const len = Math.hypot(rise, depth);
    return v((dx * rise) / len, depth / len, (dz * rise) / len);
  };
  const sideNormal = roofNormal(-1, 0, ds);
  poly(
    "penthouse:side",
    [v(hw, e, -hl), v(hw, e, 0), v(hw + ds, w, 0), v(hw + ds, w, -hl - dd)],
    sideNormal,
  );
  poly(
    "penthouse:service",
    [v(hw, e, 0), v(hw, e, hl), v(hw + ds, w, hl + dg), v(hw + ds, w, 0)],
    sideNormal,
  );
  poly(
    "penthouse:dedans",
    [v(-hw, e, -hl), v(-hw, w, -hl - dd), v(hw + ds, w, -hl - dd), v(hw, e, -hl)],
    roofNormal(0, 1, dd),
  );
  poly(
    "penthouse:grille",
    [v(-hw, e, hl), v(hw, e, hl), v(hw + ds, w, hl + dg), v(-hw, w, hl + dg)],
    roofNormal(0, -1, dg),
  );
  seg("penthouseEdge:side", v(hw, e, -hl), v(hw, e, 0));
  seg("penthouseEdge:service", v(hw, e, 0), v(hw, e, hl));
  seg("penthouseEdge:dedans", v(-hw, e, -hl), v(hw, e, -hl));
  seg("penthouseEdge:grille", v(-hw, e, hl), v(hw, e, hl));

  // Walls above the penthouses, in play up to the Out of Court Line.
  const ooc = court.outOfCourtHeight;
  const z0 = -hl - dd;
  const z1 = hl + dg;
  const x1 = hw + ds;
  const upper: [SurfaceId, (y: number) => Vec3[], Vec3, number][] = [
    [
      "serviceWall",
      (y) => [v(x1, w, z0), v(x1, w, z1), v(x1, y, z1), v(x1, y, z0)],
      v(-1, 0, 0),
      ooc.service,
    ],
    [
      "highBackWall:dedans",
      (y) => [v(-hw, w, z0), v(x1, w, z0), v(x1, y, z0), v(-hw, y, z0)],
      v(0, 0, 1),
      ooc.dedans,
    ],
    [
      "highBackWall:grille",
      (y) => [v(-hw, w, z1), v(x1, w, z1), v(x1, y, z1), v(-hw, y, z1)],
      v(0, 0, -1),
      ooc.grille,
    ],
  ];
  for (const [surface, quad, normal, top] of upper) {
    poly(surface, quad(top), normal);
    const [a, b] = quad(top);
    const [c, d] = quad(height).slice(2);
    poly("outOfCourt", [{ ...a!, y: top }, { ...b!, y: top }, c!, d!], normal);
  }

  // Main Wall, which runs the full length of the building above the penthouses.
  const main = (z0: number, z1: number, y0: number, y1: number, surface: SurfaceId) =>
    poly(surface, [v(-hw, y0, z0), v(-hw, y1, z0), v(-hw, y1, z1), v(-hw, y0, z1)], v(1, 0, 0));
  main(-hl, hl, 0, e, "mainWall");
  main(z0, z1, e, ooc.main, "mainWall");
  main(z0, z1, ooc.main, height, "outOfCourt");

  // Ceiling.
  poly(
    "outOfCourt",
    [v(-hw, height, z0), v(x1, height, z0), v(x1, height, z1), v(-hw, height, z1)],
    v(0, -1, 0),
  );

  // Tambour: an angled face, then a face parallel to the Main Wall up to the Grille Wall.
  const tz1 = hl - tambour.edge;
  const tz0 = tz1 - tambour.projection / Math.tan((tambour.angle * Math.PI) / 180);
  const tx = -hw + tambour.projection;
  const th = ooc.main;
  const fl = Math.hypot(tambour.projection, tz1 - tz0);
  poly(
    "tambour",
    [v(-hw, 0, tz0), v(-hw, th, tz0), v(tx, th, tz1), v(tx, 0, tz1)],
    v((tz1 - tz0) / fl, 0, -tambour.projection / fl),
  );
  poly("tambour", [v(tx, 0, tz1), v(tx, th, tz1), v(tx, th, hl), v(tx, 0, hl)], v(1, 0, 0));
  seg("tambour", v(tx, 0, tz1), v(tx, th, tz1));

  out.push({ kind: "net", surface: "net", x0: -hw, x1: hw });
  return out;
}

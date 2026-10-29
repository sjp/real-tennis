import type {
  ChaseMark,
  CourtDefinition,
  FloorPoint,
  Opening,
  Side,
  WallId,
  WallRect,
} from "./types.ts";

export interface FloorClassification {
  readonly side: Side;
  readonly inHazardCourt: boolean;
  /** On or beyond the Service Line, towards the Grille Wall. */
  readonly beyondServiceLine: boolean;
  /** In the Service Court, lines included (Law 2). */
  readonly inServiceCourt: boolean;
  /** Where a Fall here would mark a chase, or null if it wouldn't. */
  readonly chaseMark: ChaseMark | null;
}

/** z of the Service Line. */
export function serviceLineZ(court: CourtDefinition): number {
  return court.floor.length / 2 - court.serviceLine;
}

/** x of the Fault Line. */
export function faultLineX(court: CourtDefinition): number {
  return court.floor.width / 2 - court.faultLine;
}

export function classifyFloorPoint(court: CourtDefinition, p: FloorPoint): FloorClassification {
  const half = court.lineWidth / 2;
  const side: Side = p.z < 0 ? "service" : "hazard";
  const lineZ = serviceLineZ(court);
  const beyondServiceLine = side === "hazard" && p.z >= lineZ - half;
  const inServiceCourt = beyondServiceLine && p.x >= faultLineX(court) - half;
  const inHazardCourt = side === "hazard" && !beyondServiceLine;

  let chaseMark: ChaseMark | null = null;
  if (side === "service") chaseMark = { side, distance: p.z + court.floor.length / 2 };
  else if (inHazardCourt) chaseMark = { side, distance: lineZ - p.z };

  return { side, inHazardCourt, beyondServiceLine, inServiceCourt, chaseMark };
}

/** A point in a wall's plane, in that wall's `u` and height. */
export interface WallContact {
  readonly wall: WallId;
  readonly u: number;
  readonly y: number;
}

/** The opening a wall contact enters, if any. Touching a post counts (Law 2). */
export function openingAt(court: CourtDefinition, c: WallContact): Opening | undefined {
  return court.openings.find(
    (o) => o.wall === c.wall && (contains(o.rect, c) || (o.post && contains(o.post, c))),
  );
}

function contains(r: WallRect, c: WallContact): boolean {
  return c.u >= r.u0 && c.u <= r.u1 && c.y >= r.y0 && c.y <= r.y1;
}

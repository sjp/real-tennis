import { faultLineX, serviceLineZ } from "./classify.ts";
import { collisionGeometry, netHeightAt, type SurfaceId } from "./collision.ts";
import type { ChaseLineId, ChaseMark, CourtDefinition, OpeningId, Side, Vec3 } from "./types.ts";

/** A part of the court that teaching can highlight and label (070). */
export type CourtFeature =
  | "net"
  | "mainWall"
  | "sideWall"
  | "serviceWall"
  | "tambour"
  | "dedansPenthouse"
  | "sidePenthouse"
  | "servicePenthouse"
  | "grillePenthouse"
  | "grilleEnd"
  | "outOfCourt"
  | "serviceLine"
  | "faultLine"
  | "secondGalleryLine"
  | "serviceCourt"
  | "hazardCourt"
  | "pass"
  | "serviceEnd"
  | "hazardEnd"
  | "chaseLines"
  | "hazardChaseLines"
  | "galleries"
  | `opening:${OpeningId}`;

export interface FeatureShape {
  /** Flat polygons covering the feature, lifted a little off their surface. */
  readonly polygons: readonly { readonly vertices: readonly Vec3[]; readonly normal: Vec3 }[];
  /** Where its label goes. */
  readonly label: Vec3;
}

type OpeningFeature = `opening:${OpeningId}`;

const isOpening = (f: CourtFeature): f is OpeningFeature => f.startsWith("opening:");

const FEATURE_NAMES: Readonly<Record<Exclude<CourtFeature, OpeningFeature>, string>> = {
  net: "Net",
  mainWall: "Main Wall",
  sideWall: "Side Wall",
  serviceWall: "Service Wall",
  tambour: "Tambour",
  dedansPenthouse: "Dedans Penthouse",
  sidePenthouse: "Side Penthouse",
  servicePenthouse: "Service Penthouse",
  grillePenthouse: "Grille Penthouse",
  grilleEnd: "Grille Penthouse and High Back Wall",
  outOfCourt: "Out of court",
  serviceLine: "Service Line",
  faultLine: "Fault Line",
  secondGalleryLine: "Second Gallery line",
  serviceCourt: "Service Court",
  hazardCourt: "Hazard Court",
  pass: "The pass",
  serviceEnd: "Service end",
  hazardEnd: "Hazard end",
  chaseLines: "Chase lines",
  hazardChaseLines: "Hazard chase lines",
  galleries: "Galleries",
};

export function featureName(court: CourtDefinition, f: CourtFeature): string {
  if (isOpening(f)) return court.openings.find((o) => `opening:${o.id}` === f)!.name;
  return FEATURE_NAMES[f];
}

/** Strips in the net's highlight. */
const NET_PIECES = 24;

/** How far a highlight sits off its surface, so it doesn't flicker into it. */
const LIFT = 0.01;
const UP: Vec3 = { x: 0, y: 1, z: 0 };

type SurfaceFeature =
  | "mainWall"
  | "sideWall"
  | "serviceWall"
  | "tambour"
  | "dedansPenthouse"
  | "sidePenthouse"
  | "servicePenthouse"
  | "grillePenthouse"
  | "grilleEnd"
  | "outOfCourt";

const SURFACES: Readonly<Record<SurfaceFeature, readonly SurfaceId[]>> = {
  mainWall: ["mainWall"],
  sideWall: ["sideWall"],
  serviceWall: ["serviceWall"],
  tambour: ["tambour"],
  dedansPenthouse: ["penthouse:dedans"],
  sidePenthouse: ["penthouse:side", "penthouse:service"],
  servicePenthouse: ["penthouse:service"],
  grillePenthouse: ["penthouse:grille"],
  grilleEnd: ["highBackWall:grille", "penthouse:grille"],
  outOfCourt: ["outOfCourt"],
};

const NON_WINNING: readonly OpeningId[] = [
  "lineOpening",
  "firstGallery",
  "door",
  "secondGallery",
  "lastGallery",
  "hazardLineOpening",
  "hazardFirstGallery",
  "hazardDoor",
  "hazardSecondGallery",
];

const shapes = new WeakMap<CourtDefinition, Map<CourtFeature, FeatureShape>>();

/** The polygons that show `f`, and where to label it. */
export function featureShape(court: CourtDefinition, f: CourtFeature): FeatureShape {
  let cache = shapes.get(court);
  if (!cache) shapes.set(court, (cache = new Map<CourtFeature, FeatureShape>()));
  let shape = cache.get(f);
  if (!shape) cache.set(f, (shape = buildShape(court, f)));
  return shape;
}

function buildShape(court: CourtDefinition, f: CourtFeature): FeatureShape {
  const polygons = featurePolygons(court, f);
  const all = polygons.flatMap((p) => p.vertices);
  const mean = (k: "x" | "y" | "z") => all.reduce((s, v) => s + v[k], 0) / all.length;
  const label = { x: mean("x"), y: Math.max(mean("y"), 0.3), z: mean("z") };
  return { polygons, label };
}

function featurePolygons(court: CourtDefinition, f: CourtFeature): FeatureShape["polygons"] {
  const hw = court.floor.width / 2;
  const hl = court.floor.length / 2;
  const w = court.lineWidth * 3;
  const lineZ = serviceLineZ(court);
  const fx = faultLineX(court);
  const y = 0.004;
  const rect = (x0: number, x1: number, z0: number, z1: number) => ({
    vertices: [
      { x: x0, y, z: z0 },
      { x: x1, y, z: z0 },
      { x: x1, y, z: z1 },
      { x: x0, y, z: z1 },
    ],
    normal: UP,
  });
  const across = (z: number) => rect(-hw, hw, z - w / 2, z + w / 2);
  const chaseZ = (side: Side, distance: number) => markZ(court, { side, distance });

  switch (f) {
    case "net": {
      // Strips under the sagging cord, each convex, up to 1.524 m at the walls.
      const x = (i: number) => -hw + (2 * hw * i) / NET_PIECES;
      return Array.from({ length: NET_PIECES }, (_, i) => ({
        vertices: [
          { x: x(i), y: 0, z: 0 },
          { x: x(i + 1), y: 0, z: 0 },
          { x: x(i + 1), y: netHeightAt(court, x(i + 1)), z: 0 },
          { x: x(i), y: netHeightAt(court, x(i)), z: 0 },
        ],
        normal: { x: 0, y: 0, z: 1 },
      }));
    }
    case "serviceLine":
      return [across(lineZ)];
    case "faultLine":
      return [rect(fx - w / 2, fx + w / 2, lineZ, hl)];
    case "secondGalleryLine":
      return [across(chaseZ("service", lineDistance(court, "secondGallery")))];
    case "serviceCourt":
      return [rect(fx, hw, lineZ, hl)];
    case "hazardCourt":
      return [rect(-hw, hw, 0, lineZ)];
    case "pass":
      return [rect(-hw, fx, lineZ, hl)];
    case "serviceEnd":
      return [rect(-hw, hw, -hl, 0)];
    case "hazardEnd":
      return [rect(-hw, hw, 0, hl)];
    case "chaseLines":
    case "hazardChaseLines": {
      const side = f === "chaseLines" ? "service" : "hazard";
      return court.chaseLines
        .filter((l) => l.side === side)
        .map((l) => across(chaseZ(side, l.distance)));
    }
    case "galleries":
      return openingSensors(court, NON_WINNING);
    default:
      if (isOpening(f)) return openingSensors(court, [f.slice(8) as OpeningId]);
      return surfacePolygons(court, SURFACES[f]);
  }
}

function lineDistance(court: CourtDefinition, id: ChaseLineId): number {
  return court.chaseLines.find((l) => l.id === id)!.distance;
}

function surfacePolygons(court: CourtDefinition, ids: readonly SurfaceId[]) {
  return collisionGeometry(court)
    .filter((p) => p.kind === "polygon" && ids.includes(p.surface))
    .map((p) => {
      if (p.kind !== "polygon") throw new Error("unreachable");
      const n = p.normal;
      return {
        vertices: p.vertices.map((v) => ({
          x: v.x + n.x * LIFT,
          y: v.y + n.y * LIFT,
          z: v.z + n.z * LIFT,
        })),
        normal: n,
      };
    });
}

function openingSensors(court: CourtDefinition, ids: readonly OpeningId[]) {
  return collisionGeometry(court).flatMap((p) =>
    p.kind === "opening" && ids.includes(p.opening)
      ? [{ vertices: p.vertices, normal: p.normal }]
      : [],
  );
}

/** z of a chase mark, or of a chase line at that distance. */
export function markZ(court: CourtDefinition, mark: ChaseMark): number {
  return mark.side === "service"
    ? -court.floor.length / 2 + mark.distance
    : serviceLineZ(court) - mark.distance;
}

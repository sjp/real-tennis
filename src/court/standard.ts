import { yards } from "./units.ts";
import type {
  ChaseLine,
  ChaseLineId,
  CourtDefinition,
  Opening,
  OpeningOutcome,
  Side,
} from "./types.ts";

// A generic court built from the medians of the RT42 survey of 40 courts
// (rt42.org/dimensions, March 2026). Values marked "estimate" have no
// published source. See issues/020-court-geometry.md for the full list.

const LENGTH = 29.23;
const WIDTH = 9.6;
const PENTHOUSE_EDGE = 2.182;
const BANDEAU = 0.085;
const GALLERY_SILL = 1.113;
const GALLERY_TOP = PENTHOUSE_EDGE - BANDEAU;
const SERVICE_LINE = 6.42;
// Estimates.
const POST_WIDTH = 0.2;
const NET_POST_WIDTH = 0.15;
const JOUE_DEPTH = 0.3;

const hl = LENGTH / 2;
const hw = WIDTH / 2;

/**
 * A side gallery between two distances from that side's back wall. Its post
 * is centred on the boundary at `from` (the far end from the net).
 */
function gallery(
  id: Opening["id"],
  name: string,
  side: Side,
  from: number,
  to: number,
  outcome: OpeningOutcome,
  options: { post?: boolean; joue?: boolean } = {},
): Opening {
  const { post = true, joue = false } = options;
  const z = (d: number) => (side === "service" ? -hl + d : hl - d);
  const span = (a: number, b: number) => ({
    u0: Math.min(z(a), z(b)),
    u1: Math.max(z(a), z(b)),
    y0: GALLERY_SILL,
    y1: GALLERY_TOP,
  });
  const p = POST_WIDTH / 2;
  return {
    id,
    name,
    wall: "side",
    side,
    outcome,
    rect: span(post ? from + p : from, to - p),
    ...(post && { post: span(from - p, from + p) }),
    // Both ends, so a ball can't run out of the recess past the next post (192).
    joues: joue ? ["u0", "u1"] : [],
    depth: joue ? JOUE_DEPTH : 0,
  };
}

const chase = (line: ChaseLineId | "chaseTheLine" | "hazardChaseTheLine"): OpeningOutcome => ({
  kind: "chase",
  line,
});
const win: OpeningOutcome = { kind: "win" };
// The line openings run to the net post.
const toNet = hl - NET_POST_WIDTH / 2 + POST_WIDTH / 2;

const openings: Opening[] = [
  {
    id: "dedans",
    name: "the Dedans",
    wall: "dedans",
    side: "service",
    outcome: win,
    // Slightly off-centre, towards the Main Wall.
    rect: { u0: -hw + 1.37, u1: -hw + 1.37 + 6.56, y0: GALLERY_SILL, y1: GALLERY_TOP },
    joues: ["u0", "u1"],
    depth: JOUE_DEPTH,
  },
  {
    id: "grille",
    name: "the Grille",
    wall: "grille",
    side: "hazard",
    outcome: win,
    // In the corner against the tambour.
    rect: { u0: -hw + 0.47, u1: -hw + 0.47 + 0.94, y0: GALLERY_TOP - 0.98, y1: GALLERY_TOP },
    joues: ["u0", "u1"],
    depth: JOUE_DEPTH,
  },
  gallery("lastGallery", "the Last Gallery", "service", 4.875, 7.72, chase("lastGallery"), {
    post: false,
    joue: true,
  }),
  gallery("secondGallery", "the Second Gallery", "service", 7.72, 10.54, chase("secondGallery")),
  gallery("door", "the Door", "service", 10.54, 11.6, chase("door")),
  gallery("firstGallery", "the First Gallery", "service", 11.6, 13.32, chase("firstGallery")),
  gallery("lineOpening", "the Line Opening", "service", 13.32, toNet, chase("chaseTheLine")),
  gallery("winningGallery", "the Winning Gallery", "hazard", 4.89, 7.74, win, {
    post: false,
    joue: true,
  }),
  gallery(
    "hazardSecondGallery",
    "Hazard the Second Gallery",
    "hazard",
    7.74,
    10.56,
    chase("hazardSecondGallery"),
  ),
  gallery("hazardDoor", "Hazard the Door", "hazard", 10.56, 11.6, chase("hazardDoor")),
  gallery(
    "hazardFirstGallery",
    "Hazard the First Gallery",
    "hazard",
    11.6,
    13.32,
    chase("hazardFirstGallery"),
  ),
  gallery(
    "hazardLineOpening",
    "the Hazard Line Opening",
    "hazard",
    13.32,
    toNet,
    chase("hazardChaseTheLine"),
  ),
];

const line = (
  id: ChaseLineId,
  name: string,
  side: Side,
  kind: ChaseLine["kind"],
  distance: number,
): ChaseLine => ({ id, name, side, kind, distance });

// Law 6. Service-side distances are from the Dedans wall. Hazard distances
// are from the Service Line towards the net. Gallery lines sit near the
// middle of their galleries.
const chaseLines: ChaseLine[] = [
  line("halfAYard", "Half-a-Yard", "service", "halfYard", yards(0.5)),
  line("oneYard", "One Yard", "service", "yard", yards(1)),
  line("oneAndTwo", "One and Two", "service", "halfYard", yards(1.5)),
  line("two", "Two", "service", "yard", yards(2)),
  line("twoAndThree", "Two and Three", "service", "halfYard", yards(2.5)),
  line("three", "Three", "service", "yard", yards(3)),
  line("threeAndFour", "Three and Four", "service", "halfYard", yards(3.5)),
  line("four", "Four", "service", "yard", yards(4)),
  line("fourAndFive", "Four and Five", "service", "halfYard", yards(4.5)),
  line("five", "Five", "service", "yard", yards(5)),
  line("fiveAndSix", "Five and Six", "service", "halfYard", yards(5.5)),
  line("six", "Six", "service", "yard", yards(6)),
  line("halfAYardWorseThanSix", "Half-a-Yard Worse than Six", "service", "halfYard", yards(6.5)),
  line("lastGallery", "the Last Gallery", "service", "gallery", 6.405),
  line(
    "halfAYardWorseThanLastGallery",
    "Half-a-Yard Worse than the Last Gallery",
    "service",
    "halfYard",
    6.405 + yards(0.5),
  ),
  line(
    "aYardWorseThanLastGallery",
    "A Yard Worse than the Last Gallery",
    "service",
    "yard",
    6.405 + yards(1),
  ),
  line("secondGallery", "the Second Gallery", "service", "gallery", 9.15),
  line("door", "the Door", "service", "gallery", 11.03),
  line("firstGallery", "the First Gallery", "service", "gallery", 12.53),
  line("hazardHalfAYard", "Hazard Half-a-Yard", "hazard", "halfYard", yards(0.5)),
  line("hazardOneYard", "Hazard One Yard", "hazard", "yard", yards(1)),
  line("hazardOneAndTwo", "Hazard One and Two", "hazard", "halfYard", yards(1.5)),
  line("hazardTwoYards", "Hazard Two Yards", "hazard", "yard", yards(2)),
  // RT42 gives these from the Grille Wall: 9.19, 11.07 and 12.55 m.
  line(
    "hazardSecondGallery",
    "Hazard the Second Gallery",
    "hazard",
    "gallery",
    9.19 - SERVICE_LINE,
  ),
  line("hazardDoor", "Hazard the Door", "hazard", "gallery", 11.07 - SERVICE_LINE),
  line("hazardFirstGallery", "Hazard the First Gallery", "hazard", "gallery", 12.55 - SERVICE_LINE),
];

const pitch = (24.2 * Math.PI) / 180;
const penthouseDepth = 2.16;

export const standardCourt: CourtDefinition = {
  name: "Standard court",
  floor: { length: LENGTH, width: WIDTH },
  height: 9.15,
  // Estimate: the Out of Court Line height isn't published.
  outOfCourtHeight: { main: 6, service: 6, dedans: 6, grille: 6 },
  penthouses: {
    edgeHeight: PENTHOUSE_EDGE,
    wallHeight: PENTHOUSE_EDGE + penthouseDepth * Math.tan(pitch),
    bandeauHeight: BANDEAU,
    depth: { dedans: penthouseDepth, side: penthouseDepth, grille: penthouseDepth },
  },
  // Law 5.
  net: { centreHeight: yards(1), endHeight: 1.524, postWidth: NET_POST_WIDTH },
  // The angled face is 52.8° from the cross-court line. The tambour height is
  // an estimate: up to the Out of Court Line.
  tambour: { edge: 4.26, projection: 0.47, angle: 90 - 52.8 },
  serviceLine: SERVICE_LINE,
  // Estimate, from Marshall (1878): 22 ft 9 in.
  faultLine: 6.93,
  lineWidth: 0.05,
  openings,
  chaseLines,
};

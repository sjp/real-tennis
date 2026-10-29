import type { CourtDefinition, FloorPoint, Side } from "../court/types.ts";
import type { InputState } from "../input/input.ts";
import type { BallState } from "../sim/ball.ts";
import type { Racket } from "../sim/racket.ts";
import { vec, ZERO, type Vec3 } from "../sim/vec.ts";
import type { World } from "../sim/world.ts";
import { forwardZ, type PlayerParams } from "./movement.ts";
import { launch, swingFor, turnLeft } from "./shot.ts";
import type { Timing } from "./timing.ts";

const DEG = Math.PI / 180;

export type ServeStyleId =
  | "railroad"
  | "bobble"
  | "giraffe"
  | "drop"
  | "boomerang"
  | "pique"
  | "sideWall"
  | "twist";

/**
 * A serve style from the T&RA Glossary. These are styles, not rules. Every
 * number is tuned so a perfectly timed serve from `serveSpot` is good, and
 * the character of each is from memory: ⚠ verify against match video.
 */
export interface ServeStyle {
  readonly id: ServeStyleId;
  readonly name: string;
  readonly description: string;
  /** Struck from above the head, or underarm. */
  readonly overarm: boolean;
  /** Height of the ball when struck. */
  readonly contactHeight: number;
  readonly speed: number;
  /** Degrees above horizontal. */
  readonly elevation: number;
  /** Degrees from straight down the court, towards the Side Penthouse. */
  readonly heading: number;
  /** See `swingFor`: positive cuts under the ball, `side` puts on sidespin. */
  readonly brush: number;
  readonly side: number;
}

// Keys 1–8 pick these, in this order.
export const SERVE_STYLES: readonly ServeStyle[] = [
  {
    id: "railroad",
    name: "Railroad",
    description: "Fast and flat, struck overarm along the penthouse.",
    overarm: true,
    contactHeight: 2.3,
    speed: 13,
    elevation: 18,
    heading: 30,
    brush: 2,
    side: 0,
  },
  {
    id: "bobble",
    name: "Bobble",
    description: "Slow and underarm with topspin, so it bounces high.",
    overarm: false,
    contactHeight: 0.7,
    speed: 12,
    elevation: 40,
    heading: 27,
    brush: -3,
    side: 0,
  },
  {
    id: "giraffe",
    name: "Giraffe",
    description: "High and overarm with heavy cut, dropping steeply.",
    overarm: true,
    contactHeight: 2.4,
    speed: 13,
    elevation: 35,
    heading: 18,
    brush: 6,
    side: 0,
  },
  {
    id: "drop",
    name: "Drop (Chandelle)",
    description: "High and slow, with little spin.",
    overarm: false,
    contactHeight: 0.8,
    speed: 14,
    elevation: 55,
    heading: 18,
    brush: 0,
    side: 0,
  },
  {
    id: "boomerang",
    name: "Boomerang",
    description: "Runs the length of the penthouse and comes back off the Grille end.",
    overarm: true,
    contactHeight: 2.2,
    speed: 17,
    elevation: 15,
    heading: 21,
    brush: 0,
    side: 0,
  },
  {
    id: "pique",
    name: "Piqué",
    description: "Underarm with heavy cut, dying off the end wall.",
    overarm: false,
    contactHeight: 0.6,
    speed: 13,
    elevation: 35,
    heading: 24,
    brush: 6,
    side: 0,
  },
  {
    id: "sideWall",
    name: "Side Wall",
    description: "Off the wall above the Side Penthouse, then down the roof.",
    overarm: false,
    contactHeight: 0.9,
    speed: 15,
    elevation: 37,
    heading: 27,
    brush: 2,
    side: 0,
  },
  {
    id: "twist",
    name: "Twist",
    description: "Sidespin that kicks it sideways off the Grille Wall.",
    overarm: false,
    contactHeight: 0.8,
    speed: 14,
    elevation: 40,
    heading: 21,
    brush: 2,
    side: 4,
  },
];

/** Where the server stands: behind the Second Gallery line (Law 8.1(d)(i)). */
export function serveSpot(court: CourtDefinition): FloorPoint {
  return { x: court.floor.width / 2 - 2.5, z: secondGalleryLineZ(court) - 1 };
}

/** z of the Second Gallery line on the service side. */
export function secondGalleryLineZ(court: CourtDefinition): number {
  const line = court.chaseLines.find((l) => l.id === "secondGallery")!;
  return -court.floor.length / 2 + line.distance;
}

/**
 * Whether the server is touching the Second Gallery line or anywhere nearer
 * the net, which is a fault (Law 8.1(d)(i)).
 */
export function overServiceLine(
  court: CourtDefinition,
  params: PlayerParams,
  at: FloorPoint,
): boolean {
  // The feet reach about half the body's radius out from its centre.
  return at.z + params.radius / 2 >= secondGalleryLineZ(court) - court.lineWidth / 2;
}

/** The striking hand, beside the right hip and a little ahead. */
export function handPosition(at: FloorPoint, end: Side, height: number): Vec3 {
  const f = forwardZ(end);
  // Facing +z, the right is -x.
  return vec(at.x - f * 0.6, height, at.z + f * 0.3);
}

const TOSS_RELEASE = 1.5;
/** How far above the contact point an overarm toss rises. */
const TOSS_RISE = 0.5;
/**
 * An underarm toss is lifted gently from just above the contact point, so
 * there's time to swing after tossing.
 */
const UNDERARM_RELEASE = 0.3;
const UNDERARM_RISE = 0.8;

/** The ball leaving the server's hand: tossed up, or dropped. */
export function toss(style: ServeStyle, at: FloorPoint, end: Side, gravity: number): BallState {
  const release = style.overarm ? TOSS_RELEASE : style.contactHeight + UNDERARM_RELEASE;
  const apex = style.contactHeight + (style.overarm ? TOSS_RISE : UNDERARM_RISE);
  const up = Math.sqrt(2 * gravity * (apex - release));
  return { position: handPosition(at, end, release), velocity: vec(0, up, 0), spin: ZERO };
}

/** The serve's launch velocity, nudged a few degrees by the move input. */
export function serveVelocity(style: ServeStyle, end: Side, aim: InputState["move"]): Vec3 {
  const f = forwardZ(end);
  // The Side Penthouse is at +x, to the server's left facing +z.
  const heading = turnLeft(vec(0, 0, f), (style.heading - aim.x * 3) * DEG);
  return launch(style.speed, (style.elevation + aim.y * 3) * DEG, heading);
}

/** The racket for a serve at `ball`, with the strike's quality applied. */
export function planServe(
  world: World,
  player: string,
  style: ServeStyle,
  ball: BallState,
  end: Side,
  aim: InputState["move"],
  timing: Timing,
): Racket {
  const want = turnLeft(serveVelocity(style, end, aim), timing.pull);
  const swing = swingFor(world.ball, ball, want, style.brush, style.side);
  return { ...swing, player, timing: timing.quality };
}

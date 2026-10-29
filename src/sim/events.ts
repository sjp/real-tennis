import type { SurfaceId } from "../court/collision.ts";
import type { OpeningId, Side } from "../court/types.ts";
import type { Vec3 } from "./vec.ts";

export type EventSurface = SurfaceId | "racket" | "player" | `opening:${OpeningId}`;

interface EventBase {
  readonly time: number;
  /** The ball's centre at the event. */
  readonly position: Vec3;
  readonly surface: EventSurface;
}

/** What the physics tells the rules engine (050). */
export type SimEvent = EventBase &
  (
    | { readonly type: "racketHit"; readonly player: string }
    /** `bounce` counts floor bounces since the last racket hit, from 1. */
    | { readonly type: "floorBounce"; readonly bounce: number }
    | { readonly type: "wallHit" }
    | { readonly type: "penthouseHit"; readonly edge: boolean }
    | { readonly type: "tambourHit" }
    /** `face` is the side of the net the ball struck from. */
    | { readonly type: "netHit"; readonly face: Side; readonly cord: boolean }
    /** The ball met the floor and a wall at once. */
    | { readonly type: "nick" }
    | { readonly type: "enteredOpening"; readonly opening: OpeningId }
    | { readonly type: "outOfCourt" }
    | { readonly type: "playerHit"; readonly player: string }
    | { readonly type: "restOnFloor" }
  );

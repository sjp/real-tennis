import { describe, expect, it } from "vitest";
import { classifyFloorPoint } from "../court/classify.ts";
import { standardCourt as court } from "../court/standard.ts";
import { IDLE } from "../input/input.ts";
import type { SimEvent } from "../sim/events.ts";
import { hit } from "../sim/racket.ts";
import { createWorld, initialState, predict, step, type SimState } from "../sim/world.ts";
import { standardPlayer } from "./movement.ts";
import {
  overServiceLine,
  planServe,
  secondGalleryLineZ,
  SERVE_STYLES,
  serveSpot,
  toss,
  type ServeStyle,
} from "./serve.ts";
import { grade } from "./timing.ts";

const world = createWorld(court);

/** Tosses, waits for the ball to fall to the contact height, and serves. */
function serve(style: ServeStyle, error = 0): readonly SimEvent[] {
  const spot = serveSpot(court);
  let s: SimState = initialState(toss(style, spot, "service", world.ball.gravity));
  while (s.ball.velocity.y > 0 || s.ball.position.y > style.contactHeight) s = step(world, s).state;
  const racket = planServe(
    world,
    "server",
    style,
    s.ball,
    "service",
    IDLE.move,
    grade(error, false),
  );
  const struck = hit(world.ball, s, racket);
  return [...struck.events, ...predict(world, struck.state, 6).events];
}

/**
 * A simplified check of Law 8.1(d), until the rules engine (050): the ball
 * touches only the Side Penthouse or the Service Wall, not first on the
 * edge, before the Service Penthouse; then no Main Wall or Tambour before it
 * drops in the Service Court or enters the Winning Gallery.
 */
function goodService(events: readonly SimEvent[]): boolean {
  const rest = events.filter((e) => e.type !== "racketHit");
  const reached = rest.findIndex((e) => e.surface === "penthouse:service");
  if (reached < 0) return false;
  const before = rest.slice(0, reached);
  if (before[0]?.type === "penthouseHit" && before[0].edge) return false;
  if (!before.every((e) => e.surface === "penthouse:side" || e.surface === "serviceWall"))
    return false;
  for (const e of rest.slice(reached + 1)) {
    if (e.type === "enteredOpening") return e.opening === "winningGallery";
    if (e.type === "floorBounce")
      return classifyFloorPoint(court, { x: e.position.x, z: e.position.z }).inServiceCourt;
    if (e.surface === "mainWall" || e.type === "tambourHit") return false;
    if (e.type === "outOfCourt" || e.type === "netHit" || e.type === "playerHit") return false;
  }
  return false;
}

describe("serve styles", () => {
  it.each(SERVE_STYLES.map((s) => [s.name, s] as const))("a perfect %s is good", (_, style) => {
    expect(goodService(serve(style))).toBe(true);
  });

  const style = (id: string) => SERVE_STYLES.find((s) => s.id === id)!;
  const surfaces = (id: string) => serve(style(id)).map((e) => e.surface);

  it("brings the Boomerang back off the Grille end", () => {
    expect(surfaces("boomerang")).toContainEqual(expect.stringMatching(/:grille$/));
  });

  it("strikes the Service Wall first with the Side Wall serve", () => {
    expect(surfaces("sideWall")[1]).toBe("serviceWall");
  });

  it("has eight distinct styles", () => {
    expect(new Set(SERVE_STYLES.map((s) => s.id)).size).toBe(8);
  });
});

describe("serving position", () => {
  it("starts behind the Second Gallery line", () => {
    expect(overServiceLine(court, standardPlayer, serveSpot(court))).toBe(false);
  });

  it("faults the server on or past the line", () => {
    const z = secondGalleryLineZ(court);
    expect(overServiceLine(court, standardPlayer, { x: 0, z })).toBe(true);
    expect(overServiceLine(court, standardPlayer, { x: 0, z: z + 1 })).toBe(true);
    expect(overServiceLine(court, standardPlayer, { x: 0, z: z - 0.5 })).toBe(false);
  });
});

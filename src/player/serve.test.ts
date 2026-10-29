import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { IDLE } from "../input/input.ts";
import { rally, startRally } from "../rules/rally.ts";
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

/** Law 8.1(d), judged by the rules engine: no fault, and not left undecided. */
function goodService(events: readonly SimEvent[]): boolean {
  let state = startRally({ court, server: "server", receiver: "receiver", playingFor: null });
  for (const e of events) state = rally(state, e).state;
  return state.outcome !== null && state.outcome.kind !== "fault";
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
    expect(surfaces("sideWall").filter((s) => s !== "net")[1]).toBe("serviceWall");
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

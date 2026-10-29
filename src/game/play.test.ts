import { describe, expect, it } from "vitest";
import { chaseName } from "../court/chase.ts";
import { standardCourt as court } from "../court/standard.ts";
import { IDLE, type InputState } from "../input/input.ts";
import { serveSpot } from "../player/serve.ts";
import type { MatchConfig } from "../rules/match.ts";
import { createWorld, STEP } from "../sim/world.ts";
import { athleteOf, CALL_PAUSE, playStep, receiveSpot, startPlay, type PlayState } from "./play.ts";

const world = createWorld(court);
const config: MatchConfig = { players: ["a", "b"], sets: 1, suddenDeath: false };
const labels = { a: "Player", b: "Opponent" };
const idle = { a: IDLE, b: IDLE };

/** Runs for `seconds`, with `first` on the first step and idle after. */
function run(state: PlayState, seconds: number, first: Record<string, InputState> = idle) {
  let s = state;
  const calls: string[] = [];
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const r = playStep(world, s, i === 0 ? first : idle);
    s = r.state;
    calls.push(...r.calls.map((c) => c.id));
  }
  return { state: s, calls };
}

describe("a match", () => {
  const { state: start, calls } = startPlay(world, config, () => 0.2, labels);

  it("starts with the toss winner serving, and the receiver at the hazard end", () => {
    expect(calls).toMatchObject([{ id: "coinToss", message: expect.stringContaining("Player") }]);
    expect(start.match.server).toBe("a");
    expect(athleteOf(start, "a")).toMatchObject({
      end: "service",
      serve: "ready",
      motion: { position: serveSpot(court) },
    });
    expect(athleteOf(start, "b")).toMatchObject({
      end: "hazard",
      serve: null,
      motion: { position: receiveSpot(world) },
    });
  });

  it("calls a missed service, then sets up the next after a pause", () => {
    const tossed = run(start, 3, { a: { ...IDLE, swing: true }, b: IDLE });
    expect(tossed.calls).toEqual(["faultMissed"]);
    expect(tossed.state.phase).toBe("called");
    const next = run(tossed.state, CALL_PAUSE);
    expect(next.state).toMatchObject({ phase: "play", match: { faults: 1, server: "a" } });
    expect(athleteOf(next.state, "a").serve).toBe("ready");
  });

  it("changes ends after a chase with a player on forty", () => {
    const call = chaseName(court, { side: "service", distance: 3 });
    const called: PlayState = {
      ...start,
      phase: "called",
      since: start.sim.time,
      match: { ...start.match, points: { a: 3, b: 0 } },
      rally: { ...start.rally, outcome: { kind: "chase", call, reason: "chaseLaid" } },
    };
    const { state, calls } = run(called, CALL_PAUSE + STEP);
    expect(calls).toEqual(["changeEnds", "playOff"]);
    expect(state.match.server).toBe("b");
    expect(athleteOf(state, "b")).toMatchObject({ end: "service", serve: "ready" });
    expect(athleteOf(state, "a").end).toBe("hazard");
    expect(state.rally.setup.playingFor).toEqual(call);
  });

  it("ends when the match is won", () => {
    const point: PlayState = {
      ...start,
      phase: "called",
      since: start.sim.time,
      match: { ...start.match, games: { a: 5, b: 0 }, points: { a: 3, b: 0 } },
      rally: { ...start.rally, outcome: { kind: "point", winner: "a", reason: "dedans" } },
    };
    const { state, calls } = run(point, CALL_PAUSE + STEP);
    expect(calls).toEqual(["game", "set", "match"]);
    expect(state).toMatchObject({ phase: "over", match: { winner: "a" } });
  });
});

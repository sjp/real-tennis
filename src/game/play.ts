import type { FloorPoint, Side } from "../court/types.ts";
import type { InputState } from "../input/input.ts";
import { serveSpot } from "../player/serve.ts";
import {
  coinToss,
  playRest,
  rallySetup,
  startMatch,
  type MatchConfig,
  type MatchState,
} from "../rules/match.ts";
import {
  rally,
  startRally,
  type PlayerId,
  type RallyInput,
  type RallyState,
} from "../rules/rally.ts";
import type { Labels } from "../rules/score.ts";
import { teach, type TeachingEvent } from "../rules/teaching.ts";
import type { SimEvent } from "../sim/events.ts";
import { vec } from "../sim/vec.ts";
import { step, type SimState, type World } from "../sim/world.ts";
import { act, afterStep, held, playerCapsule, type Athlete, type Notice } from "./player.ts";

/** How long the Marker's call stands before the next rest is set up. */
export const CALL_PAUSE = 2;

export interface PlayState {
  readonly sim: SimState;
  /** In the order of `match.config.players`. */
  readonly athletes: readonly [Athlete, Athlete];
  readonly match: MatchState;
  readonly rally: RallyState;
  /** The ball is in play (or about to be served), the rest has been called, or the match is won. */
  readonly phase: "play" | "called" | "over";
  /** When the phase began. */
  readonly since: number;
}

export interface PlayResult {
  readonly state: PlayState;
  readonly events: readonly SimEvent[];
  readonly notices: readonly { readonly player: PlayerId; readonly notice: Notice }[];
  /** The Marker's calls. */
  readonly calls: readonly TeachingEvent[];
}

/** Where the receiver waits for the service: deep in the hazard end. ⚠ verify */
export function receiveSpot(world: World): FloorPoint {
  return { x: 1.5, z: world.court.floor.length / 2 - 2.5 };
}

/** Places both players for the next rest: the server with a ball in hand (Law 8.1(a)). */
function setUpRest(world: World, s: PlayState): PlayState {
  const server = s.match.server;
  const athletes = s.athletes.map((a): Athlete => {
    const serving = a.id === server;
    const end: Side = serving ? "service" : "hazard";
    return {
      ...a,
      end,
      serve: serving ? "ready" : null,
      swing: null,
      motion: {
        position: serving ? serveSpot(world.court) : receiveSpot(world),
        velocity: { x: 0, z: 0 },
      },
    };
  }) as unknown as readonly [Athlete, Athlete];
  return {
    ...s,
    athletes,
    rally: startRally(rallySetup(s.match)),
    phase: "play",
    since: s.sim.time,
  };
}

/**
 * A new match. The toss decides who serves first; its winner always chooses
 * to serve (050 decision 13). `random` returns numbers in [0, 1); `labels`
 * name the players in the call.
 */
export function startPlay(
  world: World,
  config: MatchConfig,
  random: () => number,
  labels: Labels,
): { readonly state: PlayState; readonly calls: readonly TeachingEvent[] } {
  const server = coinToss(config.players, random);
  return {
    state: playFrom(world, startMatch(world.court, config, server)),
    calls: [teach("coinToss", `${labels[server]!} to serve`)],
  };
}

/** Play from any point in a match, e.g. a lesson's setup, with the next rest about to start. */
export function playFrom(world: World, match: MatchState): PlayState {
  const config = match.config;
  const athlete = (id: PlayerId): Athlete => ({
    id,
    motion: { position: { x: 0, z: 0 }, velocity: { x: 0, z: 0 } },
    end: "service",
    shot: "cut",
    serveStyle: 0,
    swing: null,
    serve: null,
    struck: null,
  });
  const blank: PlayState = {
    sim: held(vec(0, world.ball.radius, 0), 0),
    athletes: [athlete(config.players[0]), athlete(config.players[1])],
    match,
    rally: startRally(rallySetup(match)),
    phase: "play",
    since: 0,
  };
  return setUpRest(world, blank);
}

export function athleteOf(s: PlayState, id: PlayerId): Athlete {
  return s.athletes.find((a) => a.id === id)!;
}

/**
 * One fixed step of a match. Pure: the same inputs give the same result.
 * Players in `autoHit` strike rally balls that come into reach (130).
 */
export function playStep(
  world: World,
  state: PlayState,
  inputs: Readonly<Record<PlayerId, InputState>>,
  autoHit: readonly PlayerId[] = [],
): PlayResult {
  const events: SimEvent[] = [];
  const notices: { player: PlayerId; notice: Notice }[] = [];
  const judged: RallyInput[] = [];
  let sim = state.sim;
  let athletes = state.athletes.map((a) => {
    const r = act(world, a, sim, inputs[a.id]!, autoHit.includes(a.id));
    sim = r.sim;
    events.push(...r.events);
    judged.push(...r.judged);
    notices.push(...r.notices.map((notice) => ({ player: a.id, notice })));
    return r.athlete;
  });

  const stepped = step(world, sim, athletes.map(playerCapsule));
  events.push(...stepped.events);
  judged.push(...stepped.events);
  athletes = athletes.map((a) => {
    const after = afterStep(a, stepped.events);
    if (after.fault) {
      notices.push({ player: a.id, notice: { type: "serverFault", reason: "missed" } });
      judged.push({ type: "serverFault", reason: "missed" });
    }
    return after.athlete;
  });

  let s: PlayState = {
    ...state,
    sim: stepped.state,
    athletes: athletes as unknown as readonly [Athlete, Athlete],
  };
  const calls: TeachingEvent[] = [];
  let judging = s.rally;
  for (const e of judged) {
    const r = rally(judging, e);
    judging = r.state;
    calls.push(...r.teaching);
  }
  s = { ...s, rally: judging };

  const now = s.sim.time;
  if (s.phase === "play" && judging.outcome) s = { ...s, phase: "called", since: now };
  else if (s.phase === "called" && now - s.since >= CALL_PAUSE) {
    const r = playRest(s.match, judging.outcome!);
    calls.push(...r.teaching);
    s = { ...s, match: r.state };
    s = r.state.winner !== null ? { ...s, phase: "over", since: now } : setUpRest(world, s);
  }
  return { state: s, events, notices, calls };
}

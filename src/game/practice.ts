import type { CourtDefinition, Side } from "../court/types.ts";
import type { InputState } from "../input/input.ts";
import { clampToEnd, forwardZ, standardPlayer } from "../player/movement.ts";
import { serveSpot } from "../player/serve.ts";
import { aimAt } from "../player/shot.ts";
import { rally, startRally, type PlayerId, type RallyState } from "../rules/rally.ts";
import type { TeachingEvent } from "../rules/teaching.ts";
import type { BallState } from "../sim/ball.ts";
import type { SimEvent } from "../sim/events.ts";
import { vec, ZERO } from "../sim/vec.ts";
import { initialState, step, type SimState, type World } from "../sim/world.ts";
import {
  act,
  afterStep,
  held,
  playerCapsule,
  rightX,
  SIDE_REACH,
  type Athlete,
  type Notice,
} from "./player.ts";

const params = standardPlayer;

export const PLAYER_ID = "human";
/** The ball machine, standing in for an opponent at the far end. */
export const MACHINE_ID = "machine";

export interface PracticeState extends Athlete {
  readonly sim: SimState;
  /** The rules engine's view of the ball in play, if it's a rest it can judge. */
  readonly rally: RallyState | null;
}

export interface PracticeResult {
  readonly state: PracticeState;
  readonly events: readonly SimEvent[];
  readonly notices: readonly Notice[];
  /** The Marker's calls from the rules engine. */
  readonly calls: readonly TeachingEvent[];
}

export function initialPractice(world: World): PracticeState {
  const court = world.court;
  return {
    id: PLAYER_ID,
    // Resting by the net post until the first feed.
    sim: held(vec(court.floor.width / 2 - 0.5, world.ball.radius, 0.5), 0),
    motion: { position: { x: 0, z: -court.floor.length / 4 }, velocity: { x: 0, z: 0 } },
    end: "service",
    shot: "cut",
    serveStyle: 0,
    swing: null,
    serve: null,
    struck: null,
    rally: null,
  };
}

/** A rest with the machine at the far end. `striker` starts one already struck. */
function practiceRally(
  court: CourtDefinition,
  end: Side,
  striker: PlayerId | null = null,
): RallyState {
  const human = end === "service";
  return startRally(
    {
      court,
      server: human ? PLAYER_ID : MACHINE_ID,
      receiver: human ? MACHINE_ID : PLAYER_ID,
      playingFor: null,
    },
    striker,
  );
}

/**
 * One fixed step of solo practice. Pure: the same inputs give the same
 * result. `autoHit` strikes rally balls that come into reach (130).
 */
export function practiceStep(
  world: World,
  state: PracticeState,
  input: InputState,
  autoHit = false,
): PracticeResult {
  const acted = act(world, state, state.sim, input, autoHit);
  let s: PracticeState = { ...state, ...acted.athlete, sim: acted.sim };
  const events = [...acted.events];
  const notices = [...acted.notices];
  const judged = [...acted.judged];

  const stepped = step(world, s.sim, [playerCapsule(s)]);
  events.push(...stepped.events);
  judged.push(...stepped.events);
  const after = afterStep(s, stepped.events);
  s = { ...s, ...after.athlete, sim: stepped.state };
  if (after.fault) {
    notices.push({ type: "serverFault", reason: "missed" });
    judged.push({ type: "serverFault", reason: "missed" });
  }

  const calls: TeachingEvent[] = [];
  let judging = s.rally;
  for (const e of judging ? judged : []) {
    const r = rally(judging!, e);
    judging = r.state;
    calls.push(...r.teaching);
  }
  return { state: { ...s, rally: judging }, events, notices, calls };
}

/**
 * Lobs a ball up just ahead of the player, coming back towards them, so it
 * bounces and rises through the forehand's hitting zone.
 */
export function feedDrop(court: CourtDefinition, state: PracticeState): PracticeState {
  const f = forwardZ(state.end);
  const { x, z } = state.motion.position;
  const ball: BallState = {
    position: vec(x + rightX(state.end) * SIDE_REACH, 1.3, z + f * 1.6),
    velocity: vec(0, 1, -f * 1.4),
    spin: ZERO,
  };
  // Judged as if the machine had sent it over the net.
  const fed = practiceRally(court, state.end, MACHINE_ID);
  const over = rally(fed, {
    type: "netCrossed",
    from: state.end === "service" ? "hazard" : "service",
    time: state.sim.time,
    position: ball.position,
    surface: "net",
  }).state;
  return { ...state, serve: null, rally: over, sim: initialState(ball, state.sim.time) };
}

/** The machine's feeds land at least this far from the net. */
const MACHINE_MIN_DEPTH = 5;

/**
 * A ball machine at the far end, landing a ball near the player with some
 * variety. `random` returns numbers in [0, 1).
 */
export function feedMachine(
  world: World,
  state: PracticeState,
  random: () => number,
): PracticeState {
  const f = forwardZ(state.end);
  const hl = world.court.floor.length / 2;
  const { x, z } = state.motion.position;
  const from = vec((random() - 0.5) * 4, 1.2, f * (hl - 1.5));
  // Bounce a little in front of the player, so it rises to them, but far
  // enough past the net that a fast feed can drop there.
  const fromNet = Math.max(MACHINE_MIN_DEPTH, -f * z - 1.5 - random() * 1.5);
  const target = vec(x + (random() - 0.5) * 3, world.ball.radius, -f * fromNet);
  // Travelling -f·z, spin about +f·x is backspin.
  const spin = vec(f * (40 + random() * 80), 0, 0);
  const velocity = aimAt(world.ball, from, target, spin, { speed: 17 + random() * 4 });
  return {
    ...state,
    serve: null,
    rally: practiceRally(world.court, state.end, MACHINE_ID),
    sim: initialState({ position: from, velocity, spin }, state.sim.time),
  };
}

/** Swaps the player to the other end, at the mirror of where they were. */
export function changeEnds(court: CourtDefinition, state: PracticeState): PracticeState {
  const end: Side = state.end === "service" ? "hazard" : "service";
  const { x, z } = state.motion.position;
  const position = clampToEnd(court, params, end, { x, z: -z });
  return {
    ...state,
    end,
    serve: null,
    rally: null,
    motion: { position, velocity: { x: 0, z: 0 } },
  };
}

/** Takes the player to the serving spot with a ball in hand. Serving is from the service end. */
export function startServe(court: CourtDefinition, state: PracticeState): PracticeState {
  return {
    ...state,
    end: "service",
    serve: "ready",
    swing: null,
    rally: practiceRally(court, "service"),
    motion: { position: serveSpot(court), velocity: { x: 0, z: 0 } },
  };
}

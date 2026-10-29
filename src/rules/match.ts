import { chaseLabel, type ChaseCall } from "../court/chase.ts";
import type { CourtDefinition } from "../court/types.ts";
import type { PlayerId, RallyOutcome, RallySetup } from "./rally.ts";
import { teach, type TeachingEvent } from "./teaching.ts";

export interface MatchConfig {
  readonly players: readonly [PlayerId, PlayerId];
  /** Best of 1, 3 or 5 sets. */
  readonly sets: 1 | 3 | 5;
  /** At forty-all, the next rest wins the game (Law 12.1(b)). */
  readonly suddenDeath: boolean;
}

export type Tally = Readonly<Record<PlayerId, number>>;

export interface MatchState {
  readonly court: CourtDefinition;
  readonly config: MatchConfig;
  /** At the service end; the other player receives (Law 8.1(a)). */
  readonly server: PlayerId;
  /** Rests won this game: 0 love, 1 fifteen, 2 thirty, 3 forty, then deuce and advantage. */
  readonly points: Tally;
  /** Games this set. */
  readonly games: Tally;
  readonly sets: Tally;
  /** Finished sets' games, in order. */
  readonly setScores: readonly Tally[];
  /** Chases laid and waiting for the change of ends (Law 9.2). */
  readonly chases: readonly ChaseCall[];
  /** Chases being played off after the change, in the order laid; the first is next (Law 9.3(a)). */
  readonly playOff: readonly ChaseCall[];
  /** Service faults since the last decided rest. */
  readonly faults: 0 | 1;
  readonly lastPoint: PlayerId | null;
  readonly lastGame: PlayerId | null;
  /** A game has been won and the next hasn't had a decided rest yet. */
  readonly newGame: boolean;
  readonly winner: PlayerId | null;
}

export interface MatchStep {
  readonly state: MatchState;
  readonly teaching: readonly TeachingEvent[];
}

/** The toss for first service (Law 7.1). `random` returns numbers in [0, 1). */
export function coinToss(players: readonly [PlayerId, PlayerId], random: () => number): PlayerId {
  return players[random() < 0.5 ? 0 : 1];
}

/** `server` is whoever takes the service end after the toss. */
export function startMatch(
  court: CourtDefinition,
  config: MatchConfig,
  server: PlayerId,
): MatchState {
  const zero = Object.fromEntries(config.players.map((p) => [p, 0]));
  return {
    court,
    config,
    server,
    points: zero,
    games: zero,
    sets: zero,
    setScores: [],
    chases: [],
    playOff: [],
    faults: 0,
    lastPoint: null,
    lastGame: null,
    newGame: false,
    winner: null,
  };
}

export function opponentOf(m: MatchState, p: PlayerId): PlayerId {
  const [a, b] = m.config.players;
  return p === a ? b : a;
}

export function receiverOf(m: MatchState): PlayerId {
  return opponentOf(m, m.server);
}

/** The setup for the next rest. */
export function rallySetup(m: MatchState): RallySetup {
  return {
    court: m.court,
    server: m.server,
    receiver: receiverOf(m),
    playingFor: m.playOff[0] ?? null,
  };
}

/** Applies a decided rest to the match. */
export function playRest(m: MatchState, outcome: RallyOutcome): MatchStep {
  if (m.winner !== null) return { state: m, teaching: [] };
  const teaching: TeachingEvent[] = [];
  let s: MatchState = m;

  switch (outcome.kind) {
    // Law 10(e): the rest counts for nothing, and an earlier fault stands.
    case "let":
      return { state: m, teaching };
    case "fault":
      if (m.faults === 0) return { state: { ...m, faults: 1 }, teaching };
      // Law 11.2(b).
      teaching.push(teach("doubleFault"));
      s = point(s, receiverOf(s), teaching);
      break;
    case "point":
      s = point(s, outcome.winner, teaching);
      break;
    case "chase":
      s = { ...s, chases: [...s.chases, outcome.call], newGame: false };
      break;
    case "chaseOff":
      s = { ...s, newGame: false };
      break;
  }
  s = { ...s, faults: 0 };

  // Each chase is played off with one rest (Law 9.3(a)), whatever happens.
  if (m.playOff.length > 0 && s.playOff === m.playOff) {
    s = { ...s, playOff: s.playOff.slice(1) };
    if (s.playOff[0]) teaching.push(teach("playOff", chaseLabel(s.playOff[0])));
  }
  return { state: changeEnds(s, teaching), teaching };
}

/** Law 8.2: two chases, or one with a player on forty or more. */
function changeEnds(s: MatchState, teaching: TeachingEvent[]): MatchState {
  if (s.winner !== null || s.playOff.length > 0 || s.chases.length === 0) return s;
  const forty = Object.values(s.points).some((p) => p >= 3);
  if (s.chases.length < 2 && !forty) return s;
  teaching.push(
    teach("changeEnds", s.chases.length >= 2 ? "two chases" : "a chase, with a player on forty"),
  );
  teaching.push(teach("playOff", chaseLabel(s.chases[0]!)));
  return { ...s, server: receiverOf(s), chases: [], playOff: s.chases };
}

function point(m: MatchState, winner: PlayerId, teaching: TeachingEvent[]): MatchState {
  const loser = opponentOf(m, winner);
  const won = m.points[winner]! + 1;
  const lost = m.points[loser]!;
  const points = { ...m.points, [winner]: won };
  const s = { ...m, points, lastPoint: winner, newGame: false };
  const game = m.config.suddenDeath ? won >= 4 : won >= 4 && won - lost >= 2;
  if (!game) {
    if (m.config.suddenDeath && won === 3 && lost === 3) teaching.push(teach("suddenDeath"));
    return s;
  }
  teaching.push(teach("game"));
  // Laws 8.2(b)(iv), 9.3(c)(iii). Any play-off rest is for the first chase.
  if (s.chases.length + s.playOff.length > 1 || (s.chases.length === 1 && !s.playOff.length))
    teaching.push(teach("chasesAnnulled"));
  const zero = { [winner]: 0, [loser]: 0 };
  const games = { ...m.games, [winner]: m.games[winner]! + 1 };
  const next = {
    ...s,
    points: zero,
    games,
    chases: [],
    playOff: [],
    lastGame: winner,
    newGame: true,
  };
  // Law 13: the first to six games, with no margin or tie-break.
  if (games[winner]! < 6) return next;
  teaching.push(teach("set"));
  const sets = { ...m.sets, [winner]: m.sets[winner]! + 1 };
  const done = { ...next, games: zero, sets, setScores: [...m.setScores, games] };
  if (sets[winner]! <= m.config.sets / 2) return done;
  teaching.push(teach("match"));
  return { ...done, winner };
}

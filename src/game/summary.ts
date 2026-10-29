import type { SimEvent } from "../sim/events.ts";
import { receiverOf } from "../rules/match.ts";
import type { PlayerId, RallyOutcome } from "../rules/rally.ts";
import type { PlayState } from "./play.ts";

/** A decided rest, as the match summary counts it. */
export interface Rest {
  readonly server: PlayerId;
  readonly receiver: PlayerId;
  /** Service faults standing before it: a fault after one is a double fault (Law 11.2(b)). */
  readonly faults: 0 | 1;
  /** Who struck last: whose stroke decided it, or null if the service never came. */
  readonly striker: PlayerId | null;
  /** A chase was being played off. */
  readonly playingFor: boolean;
  readonly outcome: RallyOutcome;
  /** Racket hits, the service included. */
  readonly strokes: number;
}

/** Racket hits in a step, while the ball is in play. */
export function strokesIn(before: PlayState, events: readonly SimEvent[]): number {
  return before.phase === "play" ? events.filter((e) => e.type === "racketHit").length : 0;
}

/** The rest decided by a step from `before` to `after`, if one was, with the strokes it took. */
export function decided(before: PlayState, after: PlayState, strokes: number): Rest | null {
  if (before.phase !== "play" || after.phase !== "called") return null;
  return {
    server: after.match.server,
    receiver: receiverOf(after.match),
    faults: after.match.faults,
    striker: after.rally.striker,
    playingFor: after.rally.setup.playingFor !== null,
    outcome: after.rally.outcome!,
    strokes,
  };
}

/** Rests won outright into the winning openings (Law 11.1(b)). */
export const WINNERS = ["dedans", "grille", "winningGallery"] as const;
export type Winner = (typeof WINNERS)[number];

export interface PlayerSummary {
  readonly rests: number;
  readonly chasesLaid: number;
  /** Rests won playing off a chase, attacking or defending. */
  readonly chasesWon: number;
  readonly openings: Readonly<Record<Winner, number>>;
  readonly faults: number;
  readonly doubleFaults: number;
}

export interface MatchSummary {
  readonly players: Readonly<Record<PlayerId, PlayerSummary>>;
  /** The most strokes in one rest. */
  readonly longest: number;
}

const EMPTY: PlayerSummary = {
  rests: 0,
  chasesLaid: 0,
  chasesWon: 0,
  openings: { dedans: 0, grille: 0, winningGallery: 0 },
  faults: 0,
  doubleFaults: 0,
};

/** The match summary's numbers, from its decided rests. */
export function summarise(players: readonly PlayerId[], rests: readonly Rest[]): MatchSummary {
  const s: Record<PlayerId, PlayerSummary> = Object.fromEntries(players.map((p) => [p, EMPTY]));
  const add = (p: PlayerId, f: (old: PlayerSummary) => Partial<PlayerSummary>) => {
    s[p] = { ...s[p]!, ...f(s[p]!) };
  };
  let longest = 0;
  for (const r of rests) {
    longest = Math.max(longest, r.strokes);
    const o = r.outcome;
    if (o.kind === "fault") add(r.server, (p) => ({ faults: p.faults + 1 }));
    if (o.kind === "chase" && r.striker) add(r.striker, (p) => ({ chasesLaid: p.chasesLaid + 1 }));
    const double = o.kind === "fault" && r.faults === 1;
    if (double) add(r.server, (p) => ({ doubleFaults: p.doubleFaults + 1 }));
    const winner = o.kind === "point" ? o.winner : double ? r.receiver : null;
    if (!winner) continue;
    add(winner, (p) => ({ rests: p.rests + 1 }));
    if (r.playingFor) add(winner, (p) => ({ chasesWon: p.chasesWon + 1 }));
    const into = WINNERS.find((w) => o.kind === "point" && w === o.reason);
    if (into) add(winner, (p) => ({ openings: { ...p.openings, [into]: p.openings[into] + 1 } }));
  }
  return { players: s, longest };
}

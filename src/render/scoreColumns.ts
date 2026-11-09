import type { MatchState } from "../rules/match.ts";
import type { PlayerId } from "../rules/rally.ts";
import { pointsShown } from "../rules/score.ts";

export interface Column {
  readonly name: string;
  readonly shown: (p: PlayerId) => number | string;
  /** For bolding the leader. */
  readonly rank: (p: PlayerId) => number;
}

const RANK: Readonly<Record<string, number>> = { "0": 0, "15": 1, "30": 2, "40": 3, Adv: 4 };

/** The scoreboard's columns: sets (in a match of more than one), games and points. */
export function scoreColumns(match: MatchState): readonly Column[] {
  const games = (p: PlayerId) => match.games[p] ?? 0;
  const sets = (p: PlayerId) => match.sets[p] ?? 0;
  const points = (p: PlayerId) => pointsShown(match, p);
  return [
    ...(match.config.sets > 1 ? [{ name: "Sets", shown: sets, rank: sets }] : []),
    { name: "Games", shown: games, rank: games },
    { name: "Points", shown: points, rank: (p) => RANK[points(p)]! },
  ];
}

/** Whether `p`'s number in a column is bold: strictly ahead of the other player. */
export function leads(c: Column, p: PlayerId, other: PlayerId): boolean {
  return c.rank(p) > c.rank(other);
}

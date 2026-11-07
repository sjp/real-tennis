import { chaseLabel, type ChaseCall } from "../court/chase.ts";
import { opponentOf, type MatchState } from "./match.ts";
import type { PlayerId } from "./rally.ts";

/** What the Marker calls each player, e.g. "Player" and "Opponent". */
export type Labels = Readonly<Record<PlayerId, string>>;

const POINTS = ["love", "fifteen", "thirty", "forty"];
const NUMBERS = ["love", "one", "two", "three", "four", "five", "six"];

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Fifteen–love", "Thirty all", "Deuce", "Advantage Player". The last winner is called first. */
export function callPoints(m: MatchState, labels: Labels): string {
  const first = m.lastPoint ?? m.server;
  const a = m.points[first]!;
  const b = m.points[opponentOf(m, first)]!;
  if (a >= 3 && b >= 3) {
    if (a === b) return m.config.suddenDeath ? "Forty all" : "Deuce";
    return `Advantage ${labels[a > b ? first : opponentOf(m, first)]!}`;
  }
  if (a === b) return `${capital(POINTS[a]!)} all`;
  return `${capital(POINTS[a]!)}–${POINTS[b]!}`;
}

/** "Two games to one", "Three games all", or "" at love all. */
export function callGames(m: MatchState): string {
  return tally(m, m.games, "game");
}

/** "One set to love", "One set all", or "" before any set is won. */
export function callSets(m: MatchState): string {
  return tally(m, m.sets, "set");
}

function tally(m: MatchState, t: MatchState["games"], unit: string): string {
  const first = m.lastGame ?? m.server;
  const a = t[first]!;
  const b = t[opponentOf(m, first)]!;
  if (a === 0 && b === 0) return "";
  const lead = Math.max(a, b);
  const units = lead === 1 ? unit : `${unit}s`;
  if (a === b) return `${capital(NUMBERS[a]!)} ${units} all`;
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return `${capital(NUMBERS[hi]!)} ${units} to ${NUMBERS[lo]!}`;
}

/** "chase better than two (1.83 m)", or "hazard chase the line (…)". */
export function callChase(call: ChaseCall): string {
  const text = chaseLabel(call).toLowerCase();
  return text.includes("chase") ? text : `chase ${text}`;
}

/**
 * The Marker's call of the score, with the chases outstanding, e.g.
 * "Fifteen–thirty, chase better than two (1.83 m)". Just after a game it
 * calls the game and the games (or sets).
 */
export function callScore(m: MatchState, labels: Labels): string {
  if (m.winner !== null) return `Game, set and match ${labels[m.winner]!}`;
  const parts: string[] = [];
  if (m.newGame && m.lastGame !== null) {
    const games = callGames(m);
    parts.push(`Game ${labels[m.lastGame]!}`);
    parts.push(games || `set ${labels[m.lastGame]!}`);
    if (!games) parts.push(callSets(m));
  } else parts.push(callPoints(m, labels));
  parts.push(...[...m.playOff, ...m.chases].map(callChase));
  return parts.map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1))).join(", ");
}

const SHOWN = ["0", "15", "30", "40"];

/** A player's points as a scoreboard shows them: "0", "15", "30", "40" or "Adv". */
export function pointsShown(m: MatchState, p: PlayerId): string {
  const a = m.points[p] ?? 0;
  const b = m.points[opponentOf(m, p)] ?? 0;
  if (a >= 3 && b >= 3) return a > b ? "Adv" : "40";
  return SHOWN[a]!;
}

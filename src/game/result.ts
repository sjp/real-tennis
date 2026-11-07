import { playRest, receiverOf, type MatchState } from "../rules/match.ts";
import type { PlayerId, RallyOutcome } from "../rules/rally.ts";
import type { Labels } from "../rules/score.ts";
import { TEACHING, type TeachingEvent, type TeachingId } from "../rules/teaching.ts";

/** A decided rest, as the result modal shows it (160). */
export interface RestResult {
  /** Who won the rest, or null when no one did (a single fault, a chase, a let). */
  readonly winner: PlayerId | null;
  /** "Point to Player", "Double fault: point to Opponent", "Chase laid", … */
  readonly title: string;
  /** Why, as the Marker called it. */
  readonly why: string;
  /** Why the score didn't change, when it didn't. */
  readonly note: string | null;
  /** The match after the rest. */
  readonly match: MatchState;
}

const NOTES: Readonly<Record<Exclude<RallyOutcome["kind"], "point">, string>> = {
  fault: "No point: one fault stands, and the server serves again",
  chase: "No point yet: the chase is played off after the change of ends",
  chaseOff: "No point: the chase is annulled",
  let: "No point: the rest is played again",
};

const TITLES: Readonly<Record<Exclude<RallyOutcome["kind"], "point">, string>> = {
  fault: "Fault",
  chase: "Chase laid",
  chaseOff: "Chase off",
  let: "Let",
};

/** The rest `outcome` decides from match `m`; `calls` are the Marker's calls as it was decided. */
export function restResult(
  m: MatchState,
  outcome: RallyOutcome,
  calls: readonly TeachingEvent[],
  labels: Labels,
): RestResult {
  const match = playRest(m, outcome).state;
  const id: TeachingId = outcome.kind === "chaseOff" ? "chaseOff" : outcome.reason;
  const why = calls.find((c) => c.id === id)?.message ?? TEACHING[id].text;
  const won = (winner: PlayerId, title: string): RestResult => ({
    winner,
    title,
    why,
    note: null,
    match,
  });
  if (outcome.kind === "point") return won(outcome.winner, `Point to ${labels[outcome.winner]!}`);
  if (outcome.kind === "fault" && m.faults === 1) {
    const receiver = receiverOf(m);
    return {
      ...won(receiver, `Double fault: point to ${labels[receiver]!}`),
      why: TEACHING.doubleFault.text,
    };
  }
  return { winner: null, title: TITLES[outcome.kind], why, note: NOTES[outcome.kind], match };
}

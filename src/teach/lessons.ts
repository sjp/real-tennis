import { chaseName } from "../court/chase.ts";
import type { CourtFeature } from "../court/features.ts";
import type { CourtDefinition, Side } from "../court/types.ts";
import { OPPONENT_ID, PLAYER_ID } from "../game/ids.ts";
import { startMatch, type MatchState } from "../rules/match.ts";
import type { RallyOutcome, RallyState } from "../rules/rally.ts";
import type { TeachingEvent, TeachingId } from "../rules/teaching.ts";
import type { SimEvent } from "../sim/events.ts";

/** What a lesson's objective sees after each step. */
export interface StepView {
  readonly calls: readonly TeachingEvent[];
  readonly events: readonly SimEvent[];
  /** The rest after the step. */
  readonly rally: RallyState | null;
  /** The rest's outcome, if it was decided in this step. */
  readonly decided: RallyOutcome | null;
  /** The learner's end. */
  readonly end: Side;
}

export type LessonSetup =
  /** Solo, with the ball machine feeding (or the learner serving) after each rest. */
  | { readonly kind: "drill"; readonly end: Side; readonly feed: "machine" | "serve" }
  /**
   * Against the Easy AI from `match`. Unless `continues`, every rest that
   * doesn't meet the objective is set up again.
   */
  | {
      readonly kind: "match";
      readonly match: (court: CourtDefinition) => MatchState;
      readonly continues?: boolean;
    };

export interface Lesson {
  readonly id: string;
  readonly title: string;
  /** Paragraphs, with control phrases as `{name}` (see wording.ts). */
  readonly intro: readonly string[];
  /** The objective, shown during the lesson. */
  readonly goal: string;
  /** How many times the objective must be met. */
  readonly count: number;
  /** Whether a step meets the objective once. */
  readonly scores: (v: StepView) => boolean;
  readonly setup: LessonSetup;
  readonly success: string;
  readonly feature?: CourtFeature;
}

const called = (v: StepView, ...ids: TeachingId[]) => v.calls.some((c) => ids.includes(c.id));
const mine = (v: StepView) => v.rally?.striker === PLAYER_ID;
/** The learner's stroke has just passed the net. */
const over = (v: StepView) =>
  mine(v) && v.events.some((e) => e.type === "netCrossed" && e.from === v.end);
const won = (v: StepView) => v.decided?.kind === "point" && v.decided.winner === PLAYER_ID;

const players = [PLAYER_ID, OPPONENT_ID] as const;
const config = { players, sets: 1, suddenDeath: false } as const;
const withScore = (m: MatchState, you: number, them: number): MatchState => ({
  ...m,
  points: { [PLAYER_ID]: you, [OPPONENT_ID]: them },
});

/** The guided tutorial (070), in order. */
export const LESSONS: readonly Lesson[] = [
  {
    id: "hitting",
    title: "Moving and hitting",
    intro: [
      "A ball machine at the far end will feed you balls. {move}",
      "{swing} to swing. Time it so the ball meets the racket beside you, as it drops after the bounce. The rings show where the ball will bounce and where you can reach it.",
    ],
    goal: "Hit 3 balls back over the net",
    count: 3,
    scores: over,
    setup: { kind: "drill", end: "service", feed: "machine" },
    success:
      "Well played. Real tennis is mostly about where the ball falls, which the next lessons cover.",
  },
  {
    id: "serving",
    title: "Serving onto the penthouse",
    intro: [
      "Every rest starts with a service from the service end. The ball goes up onto the sloping roof on your left, the Side Penthouse, and runs along it to the far end.",
      "A good service touches the Service Penthouse, past the net, then drops in the Service Court by the far wall. {swing} to toss the ball up, then {again} to strike. {serves}",
    ],
    goal: "Serve 3 good services",
    count: 3,
    scores: (v) => called(v, "goodService"),
    setup: { kind: "drill", end: "service", feed: "serve" },
    success: "Those were good services. Next, you'll be on the other end.",
    feature: "servicePenthouse",
  },
  {
    id: "receiving",
    title: "Receiving service",
    intro: [
      "Now your opponent serves to you at the hazard end. Watch the ball come along the penthouse and drop towards the back.",
      "You may play it once it has touched the Service Penthouse. Let it bounce, then return it over the net.",
    ],
    goal: "Return 2 services over the net",
    count: 2,
    scores: over,
    setup: {
      kind: "match",
      match: (court) => startMatch(court, config, OPPONENT_ID),
    },
    success: "Good returning. Most rests in real tennis start just like that.",
    feature: "serviceCourt",
  },
  {
    id: "openings",
    title: "Openings",
    intro: [
      "Three openings win the rest outright: the Dedans, the big net behind the service end; the Grille, in the far corner by the Main Wall; and the Winning Gallery, the last gallery under the penthouse at the hazard end.",
      "From the hazard end the Dedans is the big target. {hold} a direction as you strike to aim: forward to hit deeper, back to hit shorter, left or right to go sideways. A {lob} carries all the way to the back wall.",
    ],
    goal: "Hit a ball into the Dedans",
    count: 1,
    // The Grille and the Winning Gallery are behind you at the hazard end (232).
    scores: (v) => won(v) && called(v, "dedans"),
    setup: { kind: "drill", end: "hazard", feed: "machine" },
    success: "In it goes! Openings are the most direct way to win a rest.",
    feature: "opening:dedans",
  },
  {
    id: "chase",
    title: "Laying a chase",
    intro: [
      "When the ball bounces twice (Falls) at the service end, it isn't a point. The Marker lays a chase: they name where it fell, by the lines on the floor, and it's played for later.",
      "From the hazard end, hit the ball so it Falls at the service end. The nearer the back wall it falls, the harder the chase is for your opponent to beat.",
    ],
    goal: "Lay a chase at the service end",
    count: 1,
    scores: (v) => mine(v) && v.decided?.kind === "chase",
    setup: { kind: "drill", end: "hazard", feed: "machine" },
    success:
      "That's a chase. It doesn't change the score yet: it's played off after you change ends.",
    feature: "chaseLines",
  },
  {
    id: "changeEnds",
    title: "Changing ends",
    intro: [
      "Players change ends only because of chases: when two have been laid, or one has and either player is on forty.",
      "Your opponent is serving, and you're on forty. If a chase is laid now, by either of you, the players change ends. Return the service so it Falls at the service end, and the Marker will call it.",
    ],
    goal: "Play until the players change ends",
    count: 1,
    scores: (v) => called(v, "changeEnds"),
    setup: {
      kind: "match",
      match: (court) => withScore(startMatch(court, config, OPPONENT_ID), 3, 0),
    },
    success: "Changing ends is the only way to win the service end in real tennis.",
    feature: "hazardEnd",
  },
  {
    id: "playOff",
    title: "Playing off a chase",
    intro: [
      'After changing ends, each chase is played for. Here, a chase "Worse than the Door" was laid at the service end, and you attack it from the hazard end.',
      "To win the rest, make the ball Fall at the service end nearer the back wall than the chase, or win it outright. A Fall nearer the net than the chase loses. Defending, you'd let balls go that will Fall worse than the chase.",
    ],
    goal: "Win the rest playing off the chase",
    count: 1,
    scores: (v) => won(v) && v.rally?.setup.playingFor != null,
    setup: {
      kind: "match",
      match: (court) => ({
        ...startMatch(court, config, OPPONENT_ID),
        playOff: [chaseName(court, { side: "service", distance: 11.5 })],
      }),
    },
    success: "Chase won. You beat it by making the ball Fall better than the chase.",
    feature: "chaseLines",
  },
  {
    id: "hazardChase",
    title: "Hazard chases",
    intro: [
      "At the hazard end, a ball that Falls on or beyond the Service Line wins the rest for the striker. One that Falls shorter, in the Hazard Court, lays a hazard chase instead.",
      "From the service end, hit a ball that bounces twice in the Hazard Court, between the net and the Service Line. A soft {lob}, {holdingBack} as you strike, drops short.",
    ],
    goal: "Lay a hazard chase",
    count: 1,
    scores: (v) => mine(v) && v.decided?.kind === "chase" && v.decided.call.mark.side === "hazard",
    setup: { kind: "drill", end: "service", feed: "machine" },
    success: "A hazard chase. Hazard chases are measured from the Service Line towards the net.",
    feature: "hazardChaseLines",
  },
  {
    id: "tambour",
    title: "The tambour",
    intro: [
      "The tambour is the angled buttress on the Main Wall at the hazard end. A ball that hits it shoots off across the court, which makes it hard to return.",
      "From the service end, aim along the Main Wall, on your right, so the ball strikes the tambour. {hold} right as you strike to aim that way.",
    ],
    goal: "Hit the tambour",
    count: 1,
    scores: (v) => mine(v) && v.events.some((e) => e.type === "tambourHit"),
    setup: { kind: "drill", end: "service", feed: "machine" },
    success: "Off the tambour! Its angle makes the ball very hard to read.",
    feature: "tambour",
  },
  {
    id: "game",
    title: "A full game",
    intro: [
      "Put it all together: play a whole game against the Easy opponent, who serves first.",
      "The Marker calls the score and the chases as you go. {rules}",
    ],
    goal: "Play a game to the end",
    count: 1,
    scores: (v) => called(v, "game"),
    setup: {
      kind: "match",
      match: (court) => startMatch(court, config, OPPONENT_ID),
      continues: true,
    },
    success: "That's a game of real tennis. Try a full match from the menu.",
  },
];

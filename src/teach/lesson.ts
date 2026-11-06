import { aiInput, FRESH, type AiMemory } from "../ai/ai.ts";
import { AI_PRESETS } from "../ai/presets.ts";
import { athleteOf, playFrom, playStep, receiveSpot, type PlayState } from "../game/play.ts";
import { playerCapsule, type Notice } from "../game/player.ts";
import {
  feedMachine,
  initialPractice,
  PLAYER_ID,
  practiceStep,
  startServe,
  type PracticeState,
} from "../game/practice.ts";
import type { InputState } from "../input/input.ts";
import type { TeachingEvent } from "../rules/teaching.ts";
import type { SimEvent } from "../sim/events.ts";
import type { World } from "../sim/world.ts";
import { OPPONENT_ID, type Lesson, type StepView } from "./lessons.ts";

/** Seconds between one drill rest ending and the next feed or service. */
export const FEED_PAUSE = 1.2;
/** A drill rest that hasn't ended after this long is fed again. */
const FEED_TIMEOUT = 10;

export type LessonGame =
  | {
      readonly kind: "drill";
      readonly practice: PracticeState;
      /** When the last rest ended, or null while one is in play. */
      readonly idle: number | null;
      /** When the current rest was fed. */
      readonly fed: number;
    }
  | { readonly kind: "match"; readonly play: PlayState; readonly memory: AiMemory };

export interface LessonState {
  readonly lesson: Lesson;
  readonly game: LessonGame;
  /** Times the objective has been met. */
  readonly progress: number;
  readonly done: boolean;
}

export interface LessonResult {
  readonly state: LessonState;
  readonly events: readonly SimEvent[];
  /** The learner's notices. */
  readonly notices: readonly Notice[];
  readonly calls: readonly TeachingEvent[];
  /** The objective was met in this step. */
  readonly scored: boolean;
}

function setUp(world: World, lesson: Lesson): LessonGame {
  const s = lesson.setup;
  if (s.kind === "match")
    return { kind: "match", play: playFrom(world, s.match(world.court)), memory: FRESH };
  const practice = initialPractice(world);
  const motion = { position: receiveSpot(world), velocity: { x: 0, z: 0 } };
  return {
    kind: "drill",
    practice: s.end === "hazard" ? { ...practice, end: "hazard", motion } : practice,
    idle: 0,
    fed: 0,
  };
}

export function startLesson(world: World, lesson: Lesson): LessonState {
  return { lesson, game: setUp(world, lesson), progress: 0, done: false };
}

/** The learner's athlete, wherever the lesson is. */
export function learner(s: LessonState) {
  return s.game.kind === "drill" ? s.game.practice : athleteOf(s.game.play, PLAYER_ID);
}

/**
 * One fixed step of a lesson. `random` drives the machine and the AI;
 * `autoHit` lets the learner strike rally balls that come into reach (130).
 */
export function lessonStep(
  world: World,
  state: LessonState,
  input: InputState,
  random: () => number,
  autoHit = false,
): LessonResult {
  const r =
    state.game.kind === "drill"
      ? drillStep(world, state, input, random, autoHit)
      : matchStep(world, state, input, random, autoHit);
  if (state.done) return { ...r, state: { ...state, game: r.game }, scored: false };
  const scored = state.lesson.scores(r.view);
  const progress = state.progress + (scored ? 1 : 0);
  return {
    state: { ...state, game: r.game, progress, done: progress >= state.lesson.count },
    events: r.events,
    notices: r.notices,
    calls: r.calls,
    scored,
  };
}

interface Stepped {
  readonly game: LessonGame;
  readonly view: StepView;
  readonly events: readonly SimEvent[];
  readonly notices: readonly Notice[];
  readonly calls: readonly TeachingEvent[];
}

function drillStep(
  world: World,
  state: LessonState,
  input: InputState,
  random: () => number,
  autoHit: boolean,
): Stepped {
  const g = state.game;
  if (g.kind !== "drill") throw new Error("not a drill");
  const setup = state.lesson.setup;
  const before = g.practice.rally?.outcome ?? null;
  const r = practiceStep(world, g.practice, input, autoHit);
  let p = r.state;
  const now = p.sim.time;
  const outcome = p.rally?.outcome ?? null;
  const over =
    p.rally === null || outcome !== null || (p.serve === null && (!p.sim.live || p.sim.asleep));
  let idle = over ? (g.idle ?? now) : null;
  let fed = g.fed;
  if ((idle !== null && now - idle >= FEED_PAUSE) || now - fed > FEED_TIMEOUT) {
    p =
      setup.kind === "drill" && setup.feed === "serve"
        ? startServe(world.court, p)
        : feedMachine(world, p, random);
    idle = null;
    fed = now;
  }
  return {
    game: { kind: "drill", practice: p, idle, fed },
    view: {
      calls: r.calls,
      events: r.events,
      rally: r.state.rally,
      decided: before === null ? outcome : null,
      end: p.end,
    },
    events: r.events,
    notices: r.notices,
    calls: r.calls,
  };
}

function matchStep(
  world: World,
  state: LessonState,
  input: InputState,
  random: () => number,
  autoHit: boolean,
): Stepped {
  const g = state.game;
  if (g.kind !== "match") throw new Error("not a match");
  const before = g.play;
  const me = athleteOf(before, OPPONENT_ID);
  const view = {
    me,
    sim: before.sim,
    rally: before.rally,
    live: before.phase === "play",
    since: before.since,
  };
  const ai = aiInput(world, view, AI_PRESETS.easy, g.memory, random, playerCapsule(me));
  const r = playStep(
    world,
    before,
    { [PLAYER_ID]: input, [OPPONENT_ID]: ai.input },
    autoHit ? [PLAYER_ID] : [],
  );
  let play = r.state;
  const setup = state.lesson.setup;
  // Each rest that leaves the objective unmet starts again from the setup.
  const restDone = before.phase === "called" && play.phase !== "called";
  const reset = restDone && setup.kind === "match" && !setup.continues;
  const decided = before.rally.outcome === null ? play.rally.outcome : null;
  const stepView: StepView = {
    calls: r.calls,
    events: r.events,
    rally: before.phase === "called" ? before.rally : play.rally,
    decided,
    end: athleteOf(play, PLAYER_ID).end,
  };
  if (reset && !state.lesson.scores(stepView))
    play = { ...playFrom(world, setup.match(world.court)), sim: play.sim, since: play.sim.time };
  return {
    game: { kind: "match", play, memory: ai.memory },
    view: stepView,
    events: r.events,
    notices: r.notices.filter((n) => n.player === PLAYER_ID).map((n) => n.notice),
    calls: r.calls,
  };
}

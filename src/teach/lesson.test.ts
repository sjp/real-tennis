import { describe, expect, it } from "vitest";
import { aiInput, FRESH } from "../ai/ai.ts";
import { AI_PRESETS } from "../ai/presets.ts";
import { standardCourt as court } from "../court/standard.ts";
import { playerCapsule } from "../game/player.ts";
import type { InputState } from "../input/input.ts";
import { createWorld } from "../sim/world.ts";
import { seeded } from "../util/random.ts";
import { learner, lessonStep, startLesson, type LessonState } from "./lesson.ts";
import { LESSONS, type StepView } from "./lessons.ts";

const world = createWorld(court);
const NONE: InputState = { move: { x: 0, y: 0 }, sprint: false, swing: false, select: null };
/** Long enough for any lesson the stand-in can complete, in steps (5 minutes). */
const LIMIT = 240 * 300;

/** What the lesson tells the learner to do, which the AI doesn't do by itself. */
const ADVICE: Readonly<Record<string, { shot: number; aim: InputState["move"] }>> = {
  openings: { shot: 3, aim: { x: 0, y: 1 } },
  hazardChase: { shot: 3, aim: { x: 0, y: -1 } },
  tambour: { shot: 1, aim: { x: 1, y: 0 } },
};

/** Plays a lesson with the Hard AI standing in for the learner. */
function playLesson(id: string, seed: number): LessonState {
  const lesson = LESSONS.find((l) => l.id === id)!;
  const random = seeded(seed);
  const advice = ADVICE[id];
  let s = startLesson(world, lesson);
  let memory = FRESH;
  for (let i = 0; i < LIMIT && !s.done; i++) {
    const g = s.game;
    const me = learner(s);
    const view =
      g.kind === "drill"
        ? g.practice.rally && {
            me,
            sim: g.practice.sim,
            rally: g.practice.rally,
            live: true,
            since: g.fed,
          }
        : {
            me,
            sim: g.play.sim,
            rally: g.play.rally,
            live: g.play.phase === "play",
            since: g.play.since,
          };
    let input = NONE;
    if (view) {
      const r = aiInput(world, view, AI_PRESETS.hard, memory, random, playerCapsule(me));
      input = r.input;
      memory = r.memory;
    }
    if (advice && me.swing !== null) input = { ...input, move: advice.aim };
    if (advice && me.shot !== ["drive", "cut", "lob", "boast"][advice.shot - 1])
      input = { ...input, select: advice.shot };
    s = lessonStep(world, s, input, random).state;
  }
  return s;
}

describe("lessons", () => {
  it.each(LESSONS.map((l) => l.id))("%s can be completed", (id) => {
    expect(playLesson(id, 1).done).toBe(true);
  });

  it("counts the tambour only off the learner's own stroke", () => {
    const tambour = LESSONS.find((l) => l.id === "tambour")!;
    const view = (striker: string): StepView => ({
      calls: [],
      events: [{ type: "tambourHit", time: 0, position: { x: 0, y: 0, z: 0 }, surface: "tambour" }],
      rally: { setup: {}, striker } as never,
      decided: null,
      end: "service",
    });
    expect(tambour.scores(view("human"))).toBe(true);
    expect(tambour.scores(view("machine"))).toBe(false);
  });
});

describe("lesson text", () => {
  it("names the chase the playOff lesson really sets up (233)", () => {
    const lesson = LESSONS.find((l) => l.id === "playOff")!;
    if (lesson.setup.kind !== "match") throw new Error("playOff is a match lesson");
    const chase = lesson.setup.match(court).playOff[0]!;
    expect(lesson.intro[0]).toContain(`"${chase.name}"`);
  });
});

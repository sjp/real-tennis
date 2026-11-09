import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import { vec, ZERO } from "../sim/vec.ts";
import { createWorld, initialState, predict, step, type SimState } from "../sim/world.ts";
import { assist, NO_PLAN, planAssist, type AssistPlan } from "./assist.ts";

const world = createWorld(court);
const coming = initialState({ position: vec(0, 1.5, 8), velocity: vec(0, 4, -14), spin: ZERO });
const prediction = predict(world, coming, 3);
const near = { position: { x: 0, z: -8 }, velocity: { x: 0, z: 0 } };

describe("assist", () => {
  it("marks the next bounce and a reachable interception", () => {
    const a = assist(prediction, near, "service", 0);
    expect(a.bounce?.z).toBeLessThan(0);
    expect(a.intercept!.z).toBeLessThan(0);
    expect(a.intercept!.y).toBeGreaterThanOrEqual(0.2);
  });

  it("finds nothing to intercept for a player out of reach", () => {
    const far = { ...near, position: { x: 4, z: -1 } };
    const slow = initialState({ position: vec(-4, 1, -2), velocity: vec(0, 0, -6), spin: ZERO });
    expect(assist(predict(world, slow, 0.3), far, "service", 0).intercept).toBeNull();
  });

  it("ignores balls on the far side of the net", () => {
    expect(assist(prediction, near, "hazard", 0).intercept?.z ?? 1).toBeGreaterThan(0);
  });
});

describe("planAssist", () => {
  const rings = (plan: AssistPlan, sim: SimState) =>
    assist(plan.prediction!, near, "service", sim.time, 3);
  const fresh = (sim: SimState) => assist(predict(world, sim, 3), near, "service", sim.time, 3);

  it("keeps one prediction through a long flight, with the rings of a fresh one", () => {
    const lob = initialState({ position: vec(0, 1, 9), velocity: vec(0.5, 11, -7), spin: ZERO });
    let sim = lob;
    let plan = planAssist(NO_PLAN, world, sim);
    let afresh = 0;
    let checks = 0;
    let contact = false;
    for (let n = 1; n <= 240 * 6; n++) {
      const r = step(world, sim);
      sim = r.state;
      contact ||= r.events.length > 0;
      if (n % 4) continue;
      const next = planAssist(plan, world, sim);
      const p = next.prediction;
      if (p && !plan.prediction?.path.includes(p.path[0]!)) afresh++;
      plan = next;
      // A fresh prediction is slow, so check against one now and then, and
      // always just after a contact, where the plan is expected to change.
      if (n % 24 && !contact) continue;
      contact = false;
      checks++;
      const want = sim.asleep ? null : fresh(sim);
      expect(plan.prediction ? rings(plan, sim) : null).toEqual(want);
    }
    expect(checks).toBeGreaterThan(60);
    // Only as it meets the floor or a wall, not every frame.
    expect(afresh).toBeLessThan(20);
  });

  it("predicts afresh when a racket hit turns the ball where it stands", () => {
    const plan = planAssist(NO_PLAN, world, coming);
    const struck = { ...coming, ball: { ...coming.ball, velocity: vec(0, 4, 14) }, lastHitTime: 0 };
    const next = planAssist(plan, world, struck);
    expect(next.prediction).not.toBe(plan.prediction);
    expect(rings(next, struck)).toEqual(fresh(struck));
  });

  it("predicts afresh when the ball leaves the path, e.g. off a body", () => {
    const plan = planAssist(NO_PLAN, world, coming);
    const later = step(world, coming).state;
    const knocked = { ...later, ball: { ...later.ball, position: vec(0.3, 1.5, 7.9) } };
    expect(planAssist(plan, world, later).prediction!.path[0]).toBe(plan.prediction!.path[1]);
    expect(planAssist(plan, world, knocked).prediction).not.toBe(plan.prediction);
  });

  it("predicts nothing for a ball at rest or in hand", () => {
    const held = { ...coming, asleep: true };
    expect(planAssist(NO_PLAN, world, held).prediction).toBeNull();
  });
});

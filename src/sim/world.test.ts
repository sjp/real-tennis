import { describe, expect, it } from "vitest";
import { netHeightAt } from "../court/collision.ts";
import { standardCourt as court } from "../court/standard.ts";
import { kineticEnergy, standardBall } from "./ball.ts";
import type { SimEvent } from "./events.ts";
import { vec, ZERO, type Vec3 } from "./vec.ts";
import { createWorld, initialState, predict, step, STEP, type SimState } from "./world.ts";

const world = createWorld(court);
const weightless = createWorld(court, { ...standardBall, gravity: 0 });
const hw = court.floor.width / 2;
const hl = court.floor.length / 2;
const r = standardBall.radius;

const launch = (position: Vec3, velocity: Vec3, spin: Vec3 = ZERO) =>
  initialState({ position, velocity, spin });
const types = (events: readonly SimEvent[]) => events.map((e) => e.type);

/** Steps until the first event of `type`, returning the states either side of it. */
function until(w: typeof world, s: SimState, type: SimEvent["type"]) {
  for (let i = 0; i < 2400; i++) {
    const r = step(w, s);
    if (r.events.some((e) => e.type === type)) return { before: s, after: r.state };
    s = r.state;
  }
  throw new Error(`no ${type}`);
}

describe("floor bounce", () => {
  it("rebounds a dropped ball to about COR² of its height", () => {
    const { events, path } = predict(world, launch(vec(0, 2, -5), ZERO), 1.5);
    expect(types(events).slice(0, 2)).toEqual(["floorBounce", "floorBounce"]);
    const firstBounce = Math.round(events[0]!.time / STEP);
    // Heights of the ball's bottom.
    const peak = Math.max(...path.slice(firstBounce).map((p) => p.y)) - r;
    const ideal = 0.55 ** 2 * (2 - r);
    expect(peak).toBeGreaterThan(0.9 * ideal);
    expect(peak).toBeLessThan(ideal);
  });

  it("loses energy at each bounce, within the COR", () => {
    const { before, after } = until(world, launch(vec(0, 1, -5), vec(0, -6, 4)), "floorBounce");
    const ratio =
      kineticEnergy(standardBall, after.ball) / kineticEnergy(standardBall, before.ball);
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(0.75);
  });

  it("checks a backspun ball and speeds up a topspun one", () => {
    // Travelling +z, spin about -x is backspin.
    const outSpeed = (spin: number) =>
      until(world, launch(vec(0, 0.3, -5), vec(0, -5, 10), vec(spin, 0, 0)), "floorBounce").after
        .ball.velocity.z;
    expect(outSpeed(-300)).toBeLessThan(outSpeed(0));
    expect(outSpeed(-300)).toBeLessThan(10);
    expect(outSpeed(600)).toBeGreaterThan(10);
  });

  it("counts bounces, then rests on the floor and sleeps", () => {
    const { events, state } = predict(world, launch(vec(0, 1, -5), vec(1, 0, 2)), 10);
    const bounces = events.filter((e) => e.type === "floorBounce").map((e) => e.bounce);
    expect(bounces.slice(0, 2)).toEqual([1, 2]);
    expect(types(events).at(-1)).toBe("restOnFloor");
    expect(state.asleep).toBe(true);
    expect(state.ball.position.y).toBeCloseTo(r, 3);
  });

  it("counts a ball struck along the floor as touching it, and ends it (193)", () => {
    for (const vy of [0, 0.1]) {
      const { events, state } = predict(world, launch(vec(0, r, -5), vec(0, vy, 4)), 10);
      expect(events[0]).toMatchObject({ type: "floorBounce", bounce: 1 });
      expect(events[0]!.position.z).toBeLessThan(0);
      expect(types(events).at(-1)).toBe("restOnFloor");
      expect(state).toMatchObject({ live: false, asleep: true });
    }
  });

  it("never leaves a live ball asleep (193)", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const between = (lo: number, hi: number) => lo + random() * (hi - lo);
    for (let i = 0; i < 60; i++) {
      const low = i % 2 === 0;
      let s = launch(
        vec(between(-hw + 1, hw - 1), low ? r : between(0.5, 3), between(-hl + 1, hl - 1)),
        vec(between(-6, 6), low ? 0 : between(-5, 8), between(-15, 15)),
        vec(between(-200, 200), between(-200, 200), between(-200, 200)),
      );
      for (let t = 0; t < 8 / STEP && !s.asleep && s.captured === null; t++)
        s = step(world, s).state;
      expect(s.live && s.asleep).toBe(false);
    }
  });
});

describe("net", () => {
  it("stops a fast ball in the mesh without tunnelling", () => {
    const { events, path } = predict(weightless, launch(vec(0, 0.4, -3), vec(0, 0, 60)), 1);
    expect(events[0]).toMatchObject({ type: "netHit", face: "service", cord: false });
    expect(Math.max(...path.map((p) => p.z))).toBeLessThanOrEqual(0);
  });

  it("reports the face struck from the hazard side", () => {
    const { events } = predict(weightless, launch(vec(1, 0.4, 3), vec(0, 0, -20)), 1);
    expect(events[0]).toMatchObject({ type: "netHit", face: "hazard" });
  });

  it("lets a ball off the cord carry on", () => {
    const top = netHeightAt(court, 0);
    const { events } = predict(weightless, launch(vec(0, top + r / 2, -2), vec(0, 0, 10)), 0.5);
    expect(events[0]).toMatchObject({ type: "netHit", cord: true });
  });
});

describe("net crossing", () => {
  it("reports the ball crossing the net, each way", () => {
    const { events } = predict(world, launch(vec(0, 2, -3), vec(0, 3, 12)), 3);
    const crossings = events.filter((e) => e.type === "netCrossed");
    expect(crossings[0]).toMatchObject({ from: "service" });
    expect(crossings[0]!.position.z).toBeGreaterThanOrEqual(0);
    const { events: back } = predict(weightless, launch(vec(1, 2, 3), vec(0, 0, -10)), 0.5);
    expect(back[0]).toMatchObject({ type: "netCrossed", from: "hazard" });
  });
});

describe("openings", () => {
  const into = (id: string) => {
    const o = court.openings.find((o) => o.id === id)!;
    const u = (o.rect.u0 + o.rect.u1) / 2;
    const y = (o.rect.y0 + o.rect.y1) / 2;
    switch (o.wall) {
      case "dedans":
        return launch(vec(u, y, -hl + 3), vec(0, 0, -15));
      case "grille":
        return launch(vec(u, y, hl - 3), vec(0, 0, 15));
      default:
        return launch(vec(hw - 3, y, u), vec(15, 0, 0));
    }
  };

  it.each(court.openings.map((o) => o.id))("captures a ball entering the %s", (id) => {
    const { events, state } = predict(weightless, into(id), 1);
    expect(events.at(-1)).toMatchObject({ type: "enteredOpening", opening: id });
    expect(state.captured).toBe(id);
    expect(state.live).toBe(false);
  });

  // 192: a shallow ball running along a recess, towards either end.
  const recessed = court.openings.filter((o) => o.depth > 0);
  const along = recessed.flatMap((o) =>
    [-1, 1].flatMap((dir) => [1, 2].map((vin) => [o.id, dir, vin] as const)),
  );
  it.each(along)("captures a shallow ball in the %s heading %i at %i m/s", (id, dir, vin) => {
    const o = court.openings.find((o) => o.id === id)!;
    const u = (o.rect.u0 + o.rect.u1) / 2;
    const y = o.rect.y1 - 0.1;
    const start = {
      dedans: () => launch(vec(u, y, -hl + 0.05), vec(dir * 6, 0, -vin)),
      grille: () => launch(vec(u, y, hl - 0.05), vec(dir * 6, 0, vin)),
      side: () => launch(vec(hw - 0.05, y, u), vec(vin, 0, dir * 6)),
      main: () => launch(vec(-hw + 0.05, y, u), vec(-vin, 0, dir * 6)),
    }[o.wall]();
    const { events } = predict(world, start, 3);
    expect(types(events)).not.toContain("outOfCourt");
    expect(events.at(-1)).toMatchObject({ type: "enteredOpening", opening: id });
  });

  it("keeps a ball dropping into a gallery's recess off the floor below", () => {
    const o = court.openings.find((o) => o.id === "winningGallery")!;
    const u = (o.rect.u0 + o.rect.u1) / 2;
    const { events, state } = predict(
      world,
      launch(vec(hw - 0.3, o.rect.y0 + 0.2, u), vec(2, 0, 0)),
      3,
    );
    expect(types(events)).not.toContain("outOfCourt");
    expect(state.ball.position.y).toBeGreaterThan(o.rect.y0);
  });
});

describe("escape", () => {
  it("puts a ball that has escaped below the floor out of court", () => {
    const { events, state } = predict(world, launch(vec(0, -2, 0), vec(0, -1, 0)), 0.1);
    expect(types(events)).toEqual(["outOfCourt"]);
    expect(state).toMatchObject({ live: false, asleep: true });
  });
});

describe("walls", () => {
  it("reports a nick where the floor meets the Main Wall", () => {
    const { events } = predict(
      weightless,
      launch(vec(-hw + r + 1, r + 1, 2), vec(-10, -10, 0)),
      0.5,
    );
    expect(types(events).slice(0, 3).toSorted()).toEqual(["floorBounce", "nick", "wallHit"]);
  });

  it("reports the tambour", () => {
    const { events } = predict(weightless, launch(vec(0, 1, hl - 3.5), vec(-15, 0, 0)), 1);
    expect(events[0]).toMatchObject({ type: "tambourHit" });
  });

  it("ends the ball's life above the Out of Court Line", () => {
    const { events, state } = predict(world, launch(vec(0, 2, -0.5), vec(0, 14, -12)), 3);
    expect(events[0]).toMatchObject({ type: "outOfCourt" });
    expect(events).toHaveLength(1);
    expect(state.live).toBe(false);
  });
});

describe("penthouse", () => {
  it("rolls a served ball along the Side Penthouse into the hazard end", () => {
    const serve = launch(vec(hw - 1.5, 1.8, -4), vec(5, 5.5, 5.5), vec(0, 0, 0));
    const { events } = predict(world, serve, 5);
    const roof = events.filter((e) => e.type === "penthouseHit");
    expect(roof.length).toBeGreaterThan(0);
    const fall = events.find((e) => e.type === "floorBounce")!;
    expect(fall.position.z).toBeGreaterThan(0);
  });
});

describe("players", () => {
  it("reports a ball striking a player", () => {
    const player = { id: "server", a: vec(0, 0.3, 3), b: vec(0, 1.5, 3), radius: 0.25 };
    const { events, state } = predict(weightless, launch(vec(0, 1, 0.5), vec(0, 0, 10)), 1, [
      player,
    ]);
    expect(events[0]).toMatchObject({ type: "playerHit", player: "server" });
    expect(state.live).toBe(false);
  });
});

describe("step", () => {
  it("is deterministic", () => {
    const s = launch(vec(1, 2, -6), vec(3, 4, 18), vec(-50, 20, 10));
    expect(predict(world, s, 4)).toEqual(predict(world, s, 4));
  });

  it("costs well under 1 ms per 60 Hz frame", () => {
    const s = launch(vec(1, 2, -6), vec(6, 6, 18), vec(-50, 20, 10));
    predict(world, s, 4);
    const t0 = performance.now();
    const { path } = predict(world, s, 4);
    const perFrame = ((performance.now() - t0) / (path.length - 1)) * 4;
    expect(perFrame).toBeLessThan(1);
  });
});

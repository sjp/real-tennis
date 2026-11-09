import { describe, expect, it } from "vitest";
import { netHeightAt } from "../court/collision.ts";
import { standardCourt as court } from "../court/standard.ts";
import { kineticEnergy, standardBall } from "./ball.ts";
import type { SimEvent } from "./events.ts";
import { dot, length, madd, normalize, scale, sub, vec, ZERO, type Vec3 } from "./vec.ts";
import { createWorld, initialState, predict, step, STEP, type SimState } from "./world.ts";
import { seeded } from "../util/random.ts";

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

describe("createWorld", () => {
  it("accepts the standard court", () => {
    expect(world.bodies.length).toBeGreaterThan(0);
  });

  it("rejects a zero-area polygon (195)", () => {
    // No projection: the tambour's angled face collapses to a line.
    const flat = { ...court, tambour: { ...court.tambour, projection: 0 } };
    expect(() => createWorld(flat)).toThrow(/no area/);
  });

  it("rejects a zero-length segment (195)", () => {
    // A flat post-less opening with no height has zero-length ends.
    const openings = court.openings.map((o) =>
      o.id === "dedans" ? { ...o, joues: [], depth: 0, rect: { ...o.rect, y1: o.rect.y0 } } : o,
    );
    expect(() => createWorld({ ...court, openings })).toThrow(/no length/);
  });
});

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
    const random = seeded(7);
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

  it("ends a slow roller when it slows below the rest speed, before it sleeps", () => {
    // Struck along the floor, so there is no Fall and no fall-roll timeout.
    const { after } = until(world, launch(vec(0, r, -5), vec(0, 0, 0.3)), "restOnFloor");
    const speed = Math.hypot(after.ball.velocity.x, after.ball.velocity.z);
    expect(after).toMatchObject({ live: false, asleep: false, fallTime: null });
    expect(speed).toBeGreaterThan(0.01);
    expect(speed).toBeLessThan(0.05);
  });

  it("ends a ball half a second after the Fall, while it still rolls fast", () => {
    let s = launch(vec(0, 0.4, -12), vec(0, 0, 8));
    const events: SimEvent[] = [];
    while (!types(events).includes("restOnFloor")) {
      const r = step(world, s);
      events.push(...r.events);
      s = r.state;
    }
    const fall = events.find((e) => e.type === "floorBounce" && e.bounce === 2)!;
    expect(events.at(-1)!.time - fall.time).toBeGreaterThanOrEqual(0.5);
    expect(events.at(-1)!.time - fall.time).toBeLessThan(0.5 + STEP);
    expect(length(s.ball.velocity)).toBeGreaterThan(1);
    expect(s.asleep).toBe(false);
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

  const tx = -hw + court.tambour.projection;
  const tz1 = hl - court.tambour.edge;

  it("reports a nick at the tambour, whichever it meets first (194)", () => {
    // 10 m/s each way: 0.05 m further from one surface is 5 ms later.
    for (const [dx, dy] of [
      [0.05, 0],
      [0, 0],
      [0, 0.05],
    ]) {
      const { events } = predict(
        weightless,
        launch(vec(tx + r + 1 + dx!, r + 1 + dy!, hl - 2), vec(-10, -10, 0)),
        0.5,
      );
      expect(types(events).slice(0, 3).toSorted()).toEqual(["floorBounce", "nick", "tambourHit"]);
    }
  });

  it("keeps a ball dropped on the tambour on its top, out of court (194)", () => {
    const top = court.outOfCourtHeight.main;
    const { events, path } = predict(
      world,
      launch(vec(-hw + 0.25, 6.5, tz1 + 1), vec(0, -1, 0)),
      2,
    );
    expect(events[0]).toMatchObject({ type: "outOfCourt" });
    expect(types(events)).not.toContain("floorBounce");
    expect(Math.min(...path.map((p) => p.y))).toBeGreaterThan(top);
  });

  it("stops a ball barely moving into a wall, without a bounce or an event", () => {
    const { events, state } = predict(
      weightless,
      launch(vec(-hw + r + 0.001, 1, -5), vec(-0.1, 0, 3)),
      0.2,
    );
    expect(events).toEqual([]);
    // Only the spin the wall put on can push it back in, and only slightly.
    expect(Math.abs(state.ball.velocity.x)).toBeLessThan(0.001);
    expect(state.ball.position.x).toBeGreaterThan(-hw + r - 1e-6);
    const { events: hard } = predict(
      weightless,
      launch(vec(-hw + r + 0.001, 1, -5), vec(-1, 0, 3)),
      0.2,
    );
    expect(types(hard)).toEqual(["wallHit"]);
  });

  it("ends the ball's life above the Out of Court Line", () => {
    const { events, state } = predict(world, launch(vec(0, 2, -0.5), vec(0, 14, -12)), 3);
    expect(events[0]).toMatchObject({ type: "outOfCourt" });
    expect(events).toHaveLength(1);
    expect(state.live).toBe(false);
  });
});

describe("penthouse", () => {
  const { edgeHeight: e, wallHeight: w, depth } = court.penthouses;
  const slope = normalize(vec(-(w - e), depth.side, 0));
  const edge = vec(hw, e, -5);

  it("reports a ball striking the penthouse edge as an edge hit", () => {
    // Head-on at the edge, halfway between the bandeau's and the roof's normals.
    const out = normalize(vec(-1 + slope.x, slope.y, 0));
    const { events } = predict(weightless, launch(madd(edge, out, 1), scale(out, -10)), 0.5);
    expect(events[0]).toMatchObject({
      type: "penthouseHit",
      edge: true,
      surface: "penthouseEdge:side",
    });
  });

  it("rests a ball on the roof without a bounce or an event, and rolls it down", () => {
    const start = madd(vec(hw + depth.side / 2, e + (w - e) / 2, -5), slope, r);
    const { events, state } = predict(world, launch(start, ZERO), 0.3);
    expect(events).toEqual([]);
    const p = state.ball.position;
    expect(p.x).toBeLessThan(start.x - 0.01);
    expect(p.y).toBeLessThan(start.y);
    expect(dot(sub(p, edge), slope)).toBeCloseTo(r, 3);
  });

  it("rolls a served ball along the Side Penthouse into the hazard end", () => {
    const serve = launch(vec(hw - 1.5, 1.8, -4), vec(5, 5.5, 5.5), vec(0, 0, 0));
    const { events } = predict(world, serve, 5);
    const roof = events.filter((e) => e.type === "penthouseHit");
    expect(roof.length).toBeGreaterThan(0);
    expect(roof.map((e) => e.edge)).not.toContain(true);
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
  it("only advances the clock for a captured or sleeping ball", () => {
    const moving = launch(vec(0, 2, -5), vec(0, 3, 10));
    for (const s of [
      { ...moving, captured: "dedans" as const, live: false },
      { ...moving, asleep: true, live: false },
    ]) {
      const { state, events } = step(world, s);
      expect(events).toEqual([]);
      expect(state).toEqual({ ...s, time: s.time + STEP });
    }
  });

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

import { collisionGeometry, netHeightAt, type SurfaceId } from "../court/collision.ts";
import type { CourtDefinition, OpeningId } from "../court/types.ts";
import { flight, standardBall, type BallParams, type BallState } from "./ball.ts";
import { closestOnSegment, collide, sweepPlane, sweepSegment, type Material } from "./contact.ts";
import type { SimEvent } from "./events.ts";
import { cross, dot, length, madd, normalize, scale, sub, vec, ZERO, type Vec3 } from "./vec.ts";

/** Fixed physics step (240 Hz). */
export const STEP = 1 / 240;

export interface Materials {
  readonly floor: Material;
  readonly wall: Material;
  readonly roof: Material;
  readonly netMesh: Material;
  readonly netCord: Material;
  readonly player: Material;
}

/** Starting points to tune against match video (⚠ verify, all of them). */
export const standardMaterials: Materials = {
  floor: { restitution: 0.55, friction: 0.6 },
  wall: { restitution: 0.5, friction: 0.5 },
  roof: { restitution: 0.45, friction: 0.4 },
  netMesh: { restitution: 0.1, friction: 0.5, retention: 0.3 },
  netCord: { restitution: 0.3, friction: 0.3 },
  player: { restitution: 0.3, friction: 0.5 },
};

/** A player's body, as a capsule. Fed by 040. */
export interface PlayerCapsule {
  readonly id: string;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radius: number;
}

interface Edge {
  readonly a: Vec3;
  readonly inward: Vec3;
}

interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

type Body = Bounds &
  (
    | {
        readonly kind: "polygon" | "opening";
        readonly surface: SurfaceId;
        readonly opening?: OpeningId;
        readonly origin: Vec3;
        readonly normal: Vec3;
        readonly edges: readonly Edge[];
      }
    | {
        readonly kind: "segment";
        readonly surface: SurfaceId;
        readonly a: Vec3;
        readonly b: Vec3;
        readonly cord: boolean;
      }
    | {
        readonly kind: "netMesh";
        readonly surface: "net";
        readonly x0: number;
        readonly x1: number;
      }
  );

export interface World {
  readonly court: CourtDefinition;
  readonly ball: BallParams;
  readonly materials: Materials;
  readonly bodies: readonly Body[];
}

/** Number of straight pieces approximating the net cord's sag. */
const CORD_PIECES = 24;

function bounds(points: readonly Vec3[], pad: number): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  return {
    min: vec(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.min(...zs) - pad),
    max: vec(Math.max(...xs) + pad, Math.max(...ys) + pad, Math.max(...zs) + pad),
  };
}

function polygonEdges(vertices: readonly Vec3[], normal: Vec3): Edge[] {
  let winding = ZERO;
  vertices.forEach((v, i) => {
    winding = madd(winding, cross(v, vertices[(i + 1) % vertices.length]!), 1);
  });
  const sign = Math.sign(dot(winding, normal));
  return vertices.map((a, i) => ({
    a,
    inward: scale(cross(normal, sub(vertices[(i + 1) % vertices.length]!, a)), sign),
  }));
}

export function createWorld(
  court: CourtDefinition,
  ball: BallParams = standardBall,
  materials: Materials = standardMaterials,
): World {
  const r = ball.radius;
  const bodies: Body[] = [];
  for (const p of collisionGeometry(court)) {
    switch (p.kind) {
      case "polygon":
      case "opening": {
        const pad = p.kind === "polygon" ? r : 0;
        bodies.push({
          kind: p.kind,
          surface: p.kind === "polygon" ? p.surface : "outOfCourt",
          ...(p.kind === "opening" ? { opening: p.opening } : {}),
          origin: p.vertices[0]!,
          normal: p.normal,
          edges: polygonEdges(p.vertices, p.normal),
          ...bounds(p.vertices, pad),
        });
        break;
      }
      case "segment":
        bodies.push({ ...p, cord: false, ...bounds([p.a, p.b], r) });
        break;
      case "net": {
        const top = netHeightAt(court, p.x0);
        bodies.push({ ...p, kind: "netMesh", ...bounds([vec(p.x0, 0, 0), vec(p.x1, top, 0)], r) });
        for (let i = 0; i < CORD_PIECES; i++) {
          const x = (j: number) => p.x0 + ((p.x1 - p.x0) * j) / CORD_PIECES;
          const a = vec(x(i), netHeightAt(court, x(i)), 0);
          const b = vec(x(i + 1), netHeightAt(court, x(i + 1)), 0);
          bodies.push({ kind: "segment", surface: "net", a, b, cord: true, ...bounds([a, b], r) });
        }
        break;
      }
    }
  }
  return { court, ball, materials, bodies };
}

export interface SimState {
  readonly time: number;
  readonly ball: BallState;
  /** False once the ball can no longer produce rules events. */
  readonly live: boolean;
  /** The opening holding the ball, which then stays put. */
  readonly captured: OpeningId | null;
  /** At rest on the floor; nothing moves until it's struck. */
  readonly asleep: boolean;
  /** Floor bounces since the last racket hit. */
  readonly bounces: number;
  /** When the second bounce (the Fall) happened. */
  readonly fallTime: number | null;
  readonly lastFloorTime: number;
  readonly lastWallTime: number;
  /** When a racket last struck the ball. */
  readonly lastHitTime: number;
}

export function initialState(ball: BallState, time = 0): SimState {
  return {
    time,
    ball,
    live: true,
    captured: null,
    asleep: false,
    bounces: 0,
    fallTime: null,
    lastFloorTime: -Infinity,
    lastWallTime: -Infinity,
    lastHitTime: -Infinity,
  };
}

/** Below this approach speed a contact is resting: no bounce and no event. */
const RESTING_CONTACT = 0.2;
/** `restOnFloor` fires when the ball rolls slower than this… */
const REST_SPEED = 0.05;
/** …or this long after the second bounce. */
const FALL_ROLL = 0.5;
/** The ball sleeps once rolling slower than this. */
const SLEEP_SPEED = 0.01;
/** Floor and wall contacts this close together make a nick. */
const NICK_WINDOW = 0.01;
/** Rolling resistance on the floor, as a fraction of g (⚠ verify). */
const ROLLING_RESISTANCE = 0.03;

interface Hit {
  readonly s: number;
  readonly body: Body | PlayerCapsule;
}

function overlaps(b: Bounds, p0: Vec3, p1: Vec3): boolean {
  return (
    Math.max(p0.x, p1.x) >= b.min.x &&
    Math.min(p0.x, p1.x) <= b.max.x &&
    Math.max(p0.y, p1.y) >= b.min.y &&
    Math.min(p0.y, p1.y) <= b.max.y &&
    Math.max(p0.z, p1.z) >= b.min.z &&
    Math.min(p0.z, p1.z) <= b.max.z
  );
}

const inside = (q: Vec3, edges: readonly Edge[]) =>
  edges.every((e) => dot(sub(q, e.a), e.inward) >= -1e-9);

function sweepBody(world: World, b: Body, p0: Vec3, d: Vec3): number | null {
  const r = world.ball.radius;
  switch (b.kind) {
    case "polygon": {
      const s = sweepPlane(p0, d, b.origin, b.normal, r);
      if (s === null) return null;
      const c = madd(p0, d, s);
      return inside(madd(c, b.normal, -dot(sub(c, b.origin), b.normal)), b.edges) ? s : null;
    }
    case "opening": {
      // The centre crossing the sensor, against its normal.
      const e0 = dot(sub(p0, b.origin), b.normal);
      const e1 = e0 + dot(d, b.normal);
      if (e0 < 0 || e1 >= 0) return null;
      const s = e0 / (e0 - e1);
      const c = madd(p0, d, s);
      return inside(c, b.edges) ? s : null;
    }
    case "segment":
      return sweepSegment(p0, d, b.a, b.b, r);
    case "netMesh": {
      const side = p0.z < 0 ? -1 : 1;
      const s = sweepPlane(p0, d, ZERO, vec(0, 0, side), r);
      if (s === null) return null;
      const c = madd(p0, d, s);
      const onNet = c.x >= b.x0 && c.x <= b.x1 && c.y >= 0;
      return onNet && c.y <= netHeightAt(world.court, c.x) ? s : null;
    }
  }
}

function firstHit(
  world: World,
  p0: Vec3,
  p1: Vec3,
  skip: ReadonlySet<Body | PlayerCapsule>,
  players: readonly PlayerCapsule[],
): Hit | null {
  const d = sub(p1, p0);
  let best: Hit | null = null;
  for (const body of world.bodies) {
    if (skip.has(body) || !overlaps(body, p0, p1)) continue;
    const s = sweepBody(world, body, p0, d);
    if (s !== null && (best === null || s < best.s)) best = { s, body };
  }
  for (const player of players) {
    if (skip.has(player)) continue;
    const s = sweepSegment(p0, d, player.a, player.b, world.ball.radius + player.radius);
    if (s !== null && (best === null || s < best.s)) best = { s, body: player };
  }
  return best;
}

function contactNormal(body: Body | PlayerCapsule, p: Vec3): Vec3 {
  if (!("kind" in body)) return normalize(sub(p, closestOnSegment(p, body.a, body.b)));
  switch (body.kind) {
    case "polygon":
    case "opening":
      return body.normal;
    case "segment":
      return normalize(sub(p, closestOnSegment(p, body.a, body.b)));
    case "netMesh":
      return vec(0, 0, p.z < 0 ? -1 : 1);
  }
}

function materialFor(m: Materials, body: Body | PlayerCapsule): Material {
  if (!("kind" in body)) return m.player;
  if (body.kind === "netMesh") return m.netMesh;
  if (body.kind === "segment" && body.cord) return m.netCord;
  if (body.surface === "floor") return m.floor;
  if (body.surface.startsWith("penthouse")) return m.roof;
  return m.wall;
}

export interface StepResult {
  readonly state: SimState;
  readonly events: readonly SimEvent[];
}

/** Advances the simulation by one fixed step. Pure and deterministic. */
export function step(
  world: World,
  state: SimState,
  players: readonly PlayerCapsule[] = [],
  dt = STEP,
): StepResult {
  if (state.captured !== null || state.asleep)
    return { state: { ...state, time: state.time + dt }, events: [] };
  const p = world.ball;
  const events: SimEvent[] = [];
  const skip = new Set<Body | PlayerCapsule>();
  let s = { ...state };
  let ball = state.ball;
  let remaining = dt;
  let rolling = false;
  const emit = (e: SimEvent) => {
    if (s.live) events.push(e);
  };
  const crossing = (a: Vec3, b: Vec3) => {
    if (a.z < 0 !== b.z < 0)
      emit({
        time: s.time,
        position: b,
        type: "netCrossed",
        from: a.z < 0 ? "service" : "hazard",
        surface: "net",
      });
  };

  for (let i = 0; i < 8 && remaining > 0; i++) {
    const next = flight(p, ball, remaining);
    const hit = firstHit(world, ball.position, next.position, skip, players);
    if (hit === null) {
      s.time += remaining;
      crossing(ball.position, next.position);
      ball = next;
      break;
    }
    const t = hit.s * remaining;
    const from = ball.position;
    ball = flight(p, ball, t);
    s.time += t;
    crossing(from, ball.position);
    remaining -= t;
    skip.add(hit.body);
    const at = { time: s.time, position: ball.position };
    const body = hit.body;

    if ("kind" in body && body.kind === "opening") {
      emit({
        ...at,
        type: "enteredOpening",
        opening: body.opening!,
        surface: `opening:${body.opening!}`,
      });
      s = { ...s, ball, captured: body.opening!, live: false };
      return { state: s, events };
    }

    const n = contactNormal(body, ball.position);
    // Push the ball back out to touching, so penetration can't build up.
    const depth = p.radius - distanceAlong(body, ball.position, n);
    if (depth > 0) ball = { ...ball, position: madd(ball.position, n, depth) };
    const approach = -dot(ball.velocity, n);
    if (approach <= 0) continue;
    const material = materialFor(world.materials, body);
    if (approach < RESTING_CONTACT) {
      ball = collide(p, ball, n, { ...material, restitution: 0 });
      if ("kind" in body && body.surface === "floor") rolling = true;
      continue;
    }
    ball = collide(p, ball, n, material);

    if (!("kind" in body)) {
      emit({ ...at, type: "playerHit", player: body.id, surface: "player" });
      s.live = false;
      continue;
    }
    const surface = body.surface;
    if (surface === "floor") {
      s.bounces += 1;
      emit({ ...at, type: "floorBounce", bounce: s.bounces, surface });
      if (s.bounces === 2) s.fallTime = s.time;
      if (s.time - s.lastWallTime <= NICK_WINDOW) emit({ ...at, type: "nick", surface });
      s.lastFloorTime = s.time;
    } else if (surface === "net") {
      const cord = body.kind === "segment";
      emit({ ...at, type: "netHit", face: n.z < 0 ? "service" : "hazard", cord, surface });
    } else if (surface === "outOfCourt") {
      emit({ ...at, type: "outOfCourt", surface });
      s.live = false;
    } else if (surface.startsWith("penthouse")) {
      emit({ ...at, type: "penthouseHit", edge: surface.startsWith("penthouseEdge"), surface });
    } else if (surface === "tambour") {
      emit({ ...at, type: "tambourHit", surface });
      s.lastWallTime = s.time;
    } else {
      emit({ ...at, type: "wallHit", surface });
      if (s.time - s.lastFloorTime <= NICK_WINDOW) emit({ ...at, type: "nick", surface });
      s.lastWallTime = s.time;
    }
  }

  if (rolling) {
    // Only the motion along the floor: gravity's pull this step isn't rolling.
    const v = ball.velocity;
    const speed = Math.hypot(v.x, v.z);
    const slowed = Math.max(0, speed - ROLLING_RESISTANCE * p.gravity * dt);
    const k = speed > 0 ? slowed / speed : 0;
    ball = { ...ball, velocity: vec(v.x * k, v.y, v.z * k) };
    if (s.live && s.bounces > 0 && slowed < REST_SPEED) {
      emit({ time: s.time, position: ball.position, type: "restOnFloor", surface: "floor" });
      s.live = false;
    }
    if (slowed < SLEEP_SPEED) {
      ball = { position: { ...ball.position, y: p.radius }, velocity: ZERO, spin: ZERO };
      s.asleep = true;
    }
  }
  if (s.live && s.fallTime !== null && s.time - s.fallTime >= FALL_ROLL) {
    emit({ time: s.time, position: ball.position, type: "restOnFloor", surface: "floor" });
    s.live = false;
  }
  return { state: { ...s, ball }, events };
}

/** Distance from the contact surface to the ball's centre, along `n`. */
function distanceAlong(body: Body | PlayerCapsule, c: Vec3, n: Vec3): number {
  if (!("kind" in body)) return length(sub(c, closestOnSegment(c, body.a, body.b))) - body.radius;
  switch (body.kind) {
    case "polygon":
    case "opening":
      return dot(sub(c, body.origin), n);
    case "segment":
      return length(sub(c, closestOnSegment(c, body.a, body.b)));
    case "netMesh":
      return Math.abs(c.z);
  }
}

export interface Prediction {
  /** The ball's position after each step, starting with the current one. */
  readonly path: readonly Vec3[];
  readonly events: readonly SimEvent[];
  readonly state: SimState;
}

/** Runs the sim forward without side effects, e.g. for the AI or a trail. */
export function predict(
  world: World,
  state: SimState,
  horizon: number,
  players: readonly PlayerCapsule[] = [],
): Prediction {
  const path = [state.ball.position];
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < Math.round(horizon / STEP) && s.captured === null && !s.asleep; i++) {
    const r = step(world, s, players);
    s = r.state;
    path.push(s.ball.position);
    events.push(...r.events);
  }
  return { path, events, state: s };
}

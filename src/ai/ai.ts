import type { ChaseMark, FloorPoint, Side } from "../court/types.ts";
import { HIGH, LOW, rightX, serveMiss, SIDE_REACH, type Athlete } from "../game/player.ts";
import { clampMove, IDLE, SHOT_TYPES, type InputState, type ShotType } from "../input/input.ts";
import { forwardZ, standardPlayer } from "../player/movement.ts";
import { SWING_TIME } from "../player/timing.ts";
import { rally, type PlayerId, type RallyOutcome, type RallyState } from "../rules/rally.ts";
import type { SimEvent } from "../sim/events.ts";
import { closestOnSegment } from "../sim/contact.ts";
import { length, sub, type Vec3 } from "../sim/vec.ts";
import {
  STEP,
  predict,
  step,
  type PlayerCapsule,
  type SimState,
  type World,
} from "../sim/world.ts";
import type { AiPreset } from "./presets.ts";

/** What the AI can see: itself, the ball and the state of the rest. */
export interface AiView {
  readonly me: Athlete;
  readonly sim: SimState;
  readonly rally: RallyState;
  /** False between rests, while the Marker's call stands. */
  readonly live: boolean;
  /** When the current rest was set up. */
  readonly since: number;
}

interface Plan {
  /** Where to stand so the ball meets the racket. */
  readonly stand: FloorPoint;
  /** When to press swing, or null to let the ball go. */
  readonly swingAt: number | null;
  readonly shot: ShotType;
  /** The move input held at contact. */
  readonly aim: InputState["move"];
}

export interface AiMemory {
  /** What the ball last did, to notice when it changes course. */
  readonly seen: string;
  /** What the current plan was made from. */
  readonly planned: string;
  /** When the AI next looks again, after its reaction delay. */
  readonly lookAt: number;
  readonly plan: Plan | null;
  /** Whether it has picked its serve this rest. */
  readonly picked: boolean;
}

export const FRESH: AiMemory = { seen: "", planned: "", lookAt: 0, plan: null, picked: false };

/** How long the AI waits with the ball in hand before tossing it. */
export const SERVE_DELAY = 1.5;
/** How far ahead it predicts the ball. */
const HORIZON = 4;
const HORIZON_STEPS = Math.round(HORIZON / STEP);
/** Candidate contacts are checked every few steps. */
const SAMPLE = 4;
/** Spare time it wants in hand when running to a ball. */
const SPARE = 0.1;
const params = standardPlayer;

/** A normal variate, from `random` in [0, 1). */
export function gaussian(random: () => number): number {
  const u = 1 - random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function weighted(weights: readonly number[], random: () => number): number {
  let r = random() * weights.reduce((a, b) => a + b, 0);
  const i = weights.findIndex((w) => (r -= w) < 0);
  return i < 0 ? weights.length - 1 : i;
}

/** The camera-relative move input that runs towards `to`, slowing on arrival. */
function runTo(me: Athlete, to: FloorPoint, speed: number): InputState {
  const dx = to.x - me.motion.position.x;
  const dz = to.z - me.motion.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return IDLE;
  const f = forwardZ(me.end);
  // The inverse of `moveDirection`.
  const k = (Math.min(1, d / 0.6) * speed) / d;
  return { ...IDLE, move: clampMove(-dx * f * k, dz * f * k) };
}

/** Where it waits between shots: the middle of its end. ⚠ verify */
export function basePosition(world: World, end: Side): FloorPoint {
  return { x: 0.5, z: -forwardZ(end) * (world.court.floor.length / 2 - 5) };
}

/** Steps a swing takes from the press to contact, rounded up. */
const SWING_STEPS = Math.ceil(SWING_TIME / STEP - 1e-9);

/**
 * The serving contact time: when the tossed ball is best placed, at least
 * SWING_TIME away so the swing can meet it. An overarm toss passes the contact
 * height on the way up too soon for that, so this is the ball coming down.
 */
export function serveContact(world: World, me: Athlete, sim: SimState): number {
  const path = predict(world, sim, 2).path;
  let best = { cost: Infinity, i: SWING_STEPS };
  for (let i = SWING_STEPS; i < path.length; i++) {
    const cost = serveMiss(me, path[i]!);
    if (cost < best.cost) best = { cost, i };
  }
  return sim.time + best.i * STEP;
}

/** How good a decided rest is for `me`, from 0 (lost) to 1 (won). */
export function outcomeValue(
  world: World,
  outcome: RallyOutcome | null,
  me: PlayerId,
  end: Side,
): number {
  if (outcome === null) return 0.5;
  switch (outcome.kind) {
    case "point":
      return outcome.winner === me ? 1 : 0;
    case "fault":
      // Only the server can fault.
      return end === "service" ? 0.2 : 0.8;
    case "let":
    case "chaseOff":
      return 0.5;
    case "chase":
      return chaseValue(world, outcome.call.mark, end);
  }
}

/**
 * A chase laid on `end` is attacked later by whoever let it fall, so it's good
 * for them when it's long (easy to beat) and bad for the other player.
 */
function chaseValue(world: World, mark: ChaseMark, end: Side): number {
  const lines = world.court.chaseLines.filter((l) => l.side === mark.side);
  const longest = Math.max(...lines.map((l) => l.distance));
  const ease = Math.min(1, mark.distance / longest);
  return mark.side === end ? 0.2 + 0.6 * ease : 0.8 - 0.6 * ease;
}

/** How close the ball can pass the middle of the body: its capsule and the ball. */
const BODY = 0.4;
/** Steps after contact the ball is kept clear of the body. */
const MISSED = Math.round(0.3 / STEP);
/** Boasts are played from this close to the net. ⚠ verify */
const BOAST_RANGE = 7;

/** Just inside and outside BODY, squared: nearer or further is clear without `Math.hypot`. */
const BODY_IN = (BODY * (1 - 1e-6)) ** 2;
const BODY_OUT = (BODY * (1 + 1e-6)) ** 2;
/**
 * Steps predicted past the rest being decided: the last candidate can come a
 * sample after it, and is kept clear of the body for MISSED steps beyond.
 */
const TAIL = 2 * SAMPLE + MISSED;

/**
 * Whether the ball on its way would hit the body as it runs from `from` to
 * `stand`. `path` starts now, a step apart; only its first `end` points count.
 */
function inTheWay(
  path: readonly Vec3[],
  end: number,
  from: FloorPoint,
  stand: FloorPoint,
  speed: number,
): boolean {
  const d = Math.hypot(stand.x - from.x, stand.z - from.z);
  // The body stays in this box, so points outside it are clear.
  const pad = BODY * 1.001;
  const x0 = Math.min(from.x, stand.x) - pad;
  const x1 = Math.max(from.x, stand.x) + pad;
  const z0 = Math.min(from.z, stand.z) - pad;
  const z1 = Math.max(from.z, stand.z) + pad;
  const n = Math.min(end, path.length);
  for (let i = 0; i < n; i++) {
    const p = path[i]!;
    if (p.y > params.height || p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
    const k = d > 0 ? Math.min(d, speed * i * STEP) / d : 0;
    const dx = p.x - (from.x + (stand.x - from.x) * k);
    const dz = p.z - (from.z + (stand.z - from.z) * k);
    const q = dx * dx + dz * dz;
    if (q < BODY_IN) return true;
    if (q <= BODY_OUT && Math.hypot(dx, dz) < BODY) return true;
  }
  return false;
}

/** Whether two values hold the same data, for comparing sim states. */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) =>
    same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * Whether the ball left alone hits the body: what `predict` with the capsule
 * added would say. `states` is the flight without it, a step apart; it's
 * reused while the ball is too far away to touch the body that step, or the
 * step with the body comes out the same, so only those steps are re-run.
 */
function hitsBody(
  world: World,
  states: readonly SimState[],
  capsule: PlayerCapsule,
  id: PlayerId,
): boolean {
  const reach = world.ball.radius + capsule.radius;
  let s = states[0]!;
  for (let i = 0; i < HORIZON_STEPS && s.captured === null && !s.asleep; i++) {
    // Nothing more is reported once the ball is dead.
    if (!s.live) return false;
    const known = i + 1 < states.length && s === states[i];
    if (known) {
      // Generous: the furthest the ball can get from here within a step.
      const travel = 2 * (length(s.ball.velocity) + 20) * STEP + 0.5;
      const p = s.ball.position;
      if (length(sub(p, closestOnSegment(p, capsule.a, capsule.b))) > reach + travel) {
        s = states[i + 1]!;
        continue;
      }
    }
    const r = step(world, s, [capsule]);
    if (r.events.some((e) => e.type === "playerHit" && e.player === id)) return true;
    s = known && same(r.state, states[i + 1]) ? states[i + 1]! : r.state;
  }
  return false;
}

/** Where to stand so the ball at `at` meets the racket at its ideal contact point. */
function standFor(at: Vec3, end: Side, backhand: boolean): FloorPoint {
  const side = (backhand ? -1 : 1) * rightX(end) * SIDE_REACH;
  return { x: at.x - side, z: at.z - forwardZ(end) * 0.3 };
}

/** Time to run `d` metres from standing, at `speed`. */
function runTime(d: number, speed: number): number {
  const ramp = speed / params.acceleration;
  return d < (speed * ramp) / 2 ? Math.sqrt((2 * d) / params.acceleration) : d / speed + ramp / 2;
}

function chooseShot(
  me: Athlete,
  r: RallyState,
  preset: AiPreset,
  random: () => number,
): { shot: ShotType; aim: InputState["move"] } {
  const attacking = r.setup.playingFor !== null && r.setup.playingFor.mark.side !== me.end;
  // Ambitious shots: a drive for an opening, or a lob deep into the corner.
  if (!attacking && random() < preset.ambition) {
    return { shot: "drive", aim: { x: (random() - 0.5) * 1.6, y: 1 } };
  }
  // A boast only reaches the far side from near the net.
  const near = Math.abs(me.motion.position.z) < BOAST_RANGE;
  if (near && random() < preset.boast) return { shot: "boast", aim: { x: 0, y: 0 } };
  // A safe cut deep to the far end: a good chase, beyond the Service Line,
  // or better than the chase being played for.
  return {
    shot: "cut",
    aim: { x: (random() - 0.5) * 1.2, y: attacking ? 1 : 0.4 + random() * 0.6 },
  };
}

/**
 * Looks at the ball's flight and decides where to be and when to swing, or
 * to let it go. Candidates are checked with the rules engine, so it never
 * plans a stroke that would lose the rest (a volley before the Service
 * Penthouse, say, or reaching over the net).
 */
function makePlan(
  world: World,
  view: AiView,
  preset: AiPreset,
  random: () => number,
  capsule: PlayerCapsule,
): Plan {
  const { me, sim } = view;
  const now = sim.time;
  // The flight as `predict` gives it, but stopped a little after the rest
  // is decided: nothing later changes the plan.
  const states = [sim];
  const events: SimEvent[] = [];
  // Leaving it: what the rules engine says happens if nobody touches it.
  let left = view.rally;
  let stop = HORIZON_STEPS;
  for (let i = 0, s = sim; i < stop && s.captured === null && !s.asleep; i++) {
    const r = step(world, s);
    s = r.state;
    states.push(s);
    for (const e of r.events) {
      events.push(e);
      left = rally(left, e).state;
    }
    if (left.outcome && stop === HORIZON_STEPS) stop = Math.min(stop, i + 1 + TAIL);
  }
  const path = states.map((s) => s.ball.position);
  const f = forwardZ(me.end);
  const speed = preset.speed * params.sprintSpeed;
  const base = basePosition(world, me.end);

  const pos = me.motion.position;
  const dist = (s: FloorPoint) => Math.hypot(s.x - pos.x, s.z - pos.z);
  type Candidate = { t: number; i: number; stand: FloorPoint; bounced: boolean };
  let first: Candidate | null = null;
  let afterBounce: Candidate | null = null;
  let judging = view.rally;
  let next = 0;
  for (let i = SAMPLE; i < path.length && !afterBounce; i += SAMPLE) {
    const t = now + i * STEP;
    while (next < events.length && events[next]!.time <= t) {
      judging = rally(judging, events[next]!).state;
      next++;
    }
    if (judging.outcome) break;
    const p = path[i]!;
    if (p.y < LOW + 0.1 || p.y > HIGH - 0.2 || p.z * f > 0) continue;
    const legal = !rally(judging, {
      type: "racketHit",
      player: me.id,
      time: t,
      position: p,
      surface: "racket",
    }).state.outcome;
    if (!legal) continue;
    const stands = [false, true].map((b) => standFor(p, me.end, b));
    const stand = dist(stands[0]!) <= dist(stands[1]!) + 0.5 ? stands[0]! : stands[1]!;
    if (runTime(dist(stand), speed) + SPARE > t - now) continue;
    // Clear of the ball until just after contact, in case of a miss.
    if (inTheWay(path, i + MISSED, pos, stand, speed)) continue;
    const c = { t, i, stand, bounced: judging.drop !== null };
    first ??= c;
    if (c.bounced) afterBounce = c;
  }

  const leave = outcomeValue(world, left.outcome, me.id, me.end);
  const target = afterBounce ?? first;
  const judged = random() < preset.judgement;
  if (target === null || (judged && leave > preset.keep)) {
    // Keep out of its way: the ball touching a player loses the rest.
    const hit = hitsBody(world, states, capsule, me.id);
    const stand = hit ? { x: pos.x + (pos.x > 0 ? -1.5 : 1.5), z: pos.z } : target ? pos : base;
    return { stand, swingAt: null, shot: me.shot, aim: { x: 0, y: 0 } };
  }

  // Misjudging the flight: more so the further ahead it is.
  const ahead = target.t - now;
  const guess = {
    x: target.stand.x + gaussian(random) * preset.noise * ahead,
    z: target.stand.z + gaussian(random) * preset.noise * ahead,
  };
  const stand = inTheWay(path, target.i + MISSED, pos, guess, speed) ? target.stand : guess;
  // A hurried stroke is harder to time.
  const hurry = runTime(dist(stand), speed) / ahead;
  const { shot, aim } = chooseShot(me, view.rally, preset, random);
  return {
    stand,
    swingAt: target.t - SWING_TIME + gaussian(random) * preset.timing * (1 + 2 * hurry),
    shot,
    aim: clampMove(aim.x + gaussian(random) * preset.aim, aim.y + gaussian(random) * preset.aim),
  };
}

/** One step of the AI: the same input a human would give. */
export function aiInput(
  world: World,
  view: AiView,
  preset: AiPreset,
  memory: AiMemory,
  random: () => number,
  capsule: PlayerCapsule,
): { readonly input: InputState; readonly memory: AiMemory } {
  const { me, sim } = view;
  const now = sim.time;
  if (!view.live) return { input: IDLE, memory: FRESH };

  // Serving: pick a style, wait a moment, toss, then swing to meet it.
  if (me.serve === "ready") {
    if (!memory.picked) {
      const n = weighted(preset.serves, random) + 1;
      return { input: { ...IDLE, select: n }, memory: { ...memory, picked: true } };
    }
    return { input: { ...IDLE, swing: now - view.since >= SERVE_DELAY }, memory };
  }
  if (me.serve === "tossed") {
    let plan = memory.plan;
    if (!plan) {
      const contact = serveContact(world, me, sim);
      plan = {
        stand: me.motion.position,
        swingAt: contact - SWING_TIME + gaussian(random) * preset.timing * 0.5,
        shot: me.shot,
        aim: clampMove(gaussian(random) * preset.aim, gaussian(random) * preset.aim),
      };
    }
    return { input: strike(me, plan, now), memory: { ...memory, plan } };
  }

  // The ball in play. It looks again whenever it changes course.
  const r = view.rally;
  const seen = [sim.lastHitTime, sim.lastFloorTime, sim.lastWallTime, sim.captured].join("|");
  let m = memory;
  if (seen !== m.seen) m = { ...m, seen, lookAt: now + preset.reaction };
  const coming = r.striker !== null && r.striker !== me.id && sim.live && !sim.asleep;
  if (!coming) {
    const plan = {
      stand: basePosition(world, me.end),
      swingAt: null,
      shot: me.shot,
      aim: IDLE.move,
    };
    return { input: runTo(me, plan.stand, preset.speed), memory: { ...m, plan: null } };
  }
  // Once swinging, it sees the stroke through.
  const swinging = me.swing !== null && !me.swing.contact;
  if (!swinging && now >= m.lookAt && m.planned !== m.seen) {
    const plan = makePlan(world, view, preset, random, capsule);
    const select = plan.swingAt !== null ? SHOT_TYPES.indexOf(plan.shot) + 1 : null;
    m = { ...m, plan, planned: m.seen };
    return { input: { ...runTo(me, plan.stand, preset.speed), select }, memory: m };
  }
  if (!m.plan) return { input: IDLE, memory: m };
  return { input: strike(me, m.plan, now, preset.speed), memory: m };
}

/** Runs to the plan's spot, swings on time, and holds the aim through contact. */
function strike(me: Athlete, plan: Plan, now: number, speed = 1): InputState {
  if (me.swing && !me.swing.contact) {
    const contact = me.swing.start + SWING_TIME;
    // The aim is the move input at contact.
    if (now + 2 * STEP >= contact) return { ...IDLE, move: plan.aim };
    return me.serve !== null ? IDLE : runTo(me, plan.stand, speed);
  }
  if (plan.swingAt !== null && !me.swing && now >= plan.swingAt && now < plan.swingAt + 0.1)
    return { ...IDLE, swing: true };
  if (me.serve !== null) return IDLE;
  const run = runTo(me, plan.stand, speed);
  const far = Math.hypot(plan.stand.x - me.motion.position.x, plan.stand.z - me.motion.position.z);
  return { ...run, sprint: far > 1.5 };
}

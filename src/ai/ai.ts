import type { ChaseMark, FloorPoint, Side } from "../court/types.ts";
import { HIGH, LOW, rightX, serveMiss, SIDE_REACH, type Athlete } from "../game/player.ts";
import { IDLE, SHOT_TYPES, type InputState, type ShotType } from "../input/input.ts";
import { forwardZ, standardPlayer } from "../player/movement.ts";
import { SWING_TIME } from "../player/timing.ts";
import { rally, type PlayerId, type RallyOutcome, type RallyState } from "../rules/rally.ts";
import type { Vec3 } from "../sim/vec.ts";
import { STEP, predict, type PlayerCapsule, type SimState, type World } from "../sim/world.ts";
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
  return { ...IDLE, move: { x: -dx * f * k, y: dz * f * k } };
}

/** Where it waits between shots: the middle of its end. ⚠ verify */
export function basePosition(world: World, end: Side): FloorPoint {
  return { x: 0.5, z: -forwardZ(end) * (world.court.floor.length / 2 - 5) };
}

/** The serving contact time: when the tossed ball is best placed. */
export function serveContact(world: World, me: Athlete, sim: SimState): number {
  const path = predict(world, sim, 2).path;
  let best = { cost: Infinity, i: 0 };
  path.forEach((b, i) => {
    const cost = serveMiss(me, b);
    if (cost < best.cost) best = { cost, i };
  });
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

/**
 * Whether the ball on its way would hit the body as it runs from `from` to
 * `stand`. `path` starts now, a step apart.
 */
function inTheWay(
  path: readonly Vec3[],
  from: FloorPoint,
  stand: FloorPoint,
  speed: number,
): boolean {
  const d = Math.hypot(stand.x - from.x, stand.z - from.z);
  return path.some((p, i) => {
    if (p.y > params.height) return false;
    const k = d > 0 ? Math.min(d, speed * i * STEP) / d : 0;
    const x = from.x + (stand.x - from.x) * k;
    const z = from.z + (stand.z - from.z) * k;
    return Math.hypot(p.x - x, p.z - z) < BODY;
  });
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
  const prediction = predict(world, sim, HORIZON);
  const path = prediction.path;
  const events = prediction.events;
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
    if (inTheWay(path.slice(0, i + MISSED), pos, stand, speed)) continue;
    const c = { t, i, stand, bounced: judging.drop !== null };
    first ??= c;
    if (c.bounced) afterBounce = c;
  }

  // Leaving it: what the rules engine says happens if nobody touches it.
  let left = view.rally;
  for (const e of events) left = rally(left, e).state;
  const leave = outcomeValue(world, left.outcome, me.id, me.end);
  const target = afterBounce ?? first;
  const judged = random() < preset.judgement;
  if (target === null || (judged && leave > preset.keep)) {
    // Keep out of its way: the ball touching a player loses the rest.
    const hit = predict(world, sim, HORIZON, [capsule]).events.some(
      (e) => e.type === "playerHit" && e.player === me.id,
    );
    const stand = hit ? { x: pos.x + (pos.x > 0 ? -1.5 : 1.5), z: pos.z } : target ? pos : base;
    return { stand, swingAt: null, shot: me.shot, aim: { x: 0, y: 0 } };
  }

  // Misjudging the flight: more so the further ahead it is.
  const ahead = target.t - now;
  const guess = {
    x: target.stand.x + gaussian(random) * preset.noise * ahead,
    z: target.stand.z + gaussian(random) * preset.noise * ahead,
  };
  const stand = inTheWay(path.slice(0, target.i + MISSED), pos, guess, speed)
    ? target.stand
    : guess;
  // A hurried stroke is harder to time.
  const hurry = runTime(dist(stand), speed) / ahead;
  const { shot, aim } = chooseShot(me, view.rally, preset, random);
  return {
    stand,
    swingAt: target.t - SWING_TIME + gaussian(random) * preset.timing * (1 + 2 * hurry),
    shot,
    aim: {
      x: Math.max(-1, Math.min(1, aim.x + gaussian(random) * preset.aim)),
      y: Math.max(-1, Math.min(1, aim.y + gaussian(random) * preset.aim)),
    },
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
        aim: { x: gaussian(random) * preset.aim, y: gaussian(random) * preset.aim },
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

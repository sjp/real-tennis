import type { ShotType } from "../input/input.ts";
import type { SimEvent } from "../sim/events.ts";
import { soundOf, type Ear, type Sound } from "./sounds.ts";

/**
 * Synthesised sound (080): no asset files. The AudioContext is made on the
 * first key press or touch, as browsers allow sound only after a gesture.
 * Every tone and envelope here is ⚠ verify by ear.
 */
interface Graph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly noise: AudioBuffer;
}

let graph: Graph | null = null;
let volume = 0.7;
/** The listener, kept up to date by the scene's camera. */
export const ear: { current: Ear } = {
  current: { position: { x: 0, y: 2, z: 0 }, right: { x: -1, y: 0, z: 0 } },
};

function start() {
  if (graph) {
    if (graph.ctx.state === "suspended") void graph.ctx.resume();
    return;
  }
  const Ctx = window.AudioContext as typeof AudioContext | undefined;
  if (!Ctx) return;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  graph = { ctx, master, noise };
}

/** Starts sound on the first gesture. Safe to call more than once. */
export function armAudio() {
  if (typeof window === "undefined") return;
  for (const type of ["pointerdown", "keydown"] as const)
    window.addEventListener(type, start, { capture: true });
}

export function setVolume(v: number) {
  volume = v;
  if (graph) graph.master.gain.setTargetAtTime(v, graph.ctx.currentTime, 0.02);
}

/** A decaying envelope from `peak` over `decay` seconds, starting `attack` seconds in. */
function envelope(ctx: AudioContext, peak: number, decay: number, attack = 0.002): GainNode {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/** Filtered noise into `out`. */
function noise(
  g: Graph,
  out: AudioNode,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  decay: number,
  attack?: number,
) {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  src.loop = true;
  const filter = g.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = envelope(g.ctx, peak, decay, attack);
  src.connect(filter).connect(env).connect(out);
  src.start(g.ctx.currentTime, Math.random() * 0.5);
  src.stop(g.ctx.currentTime + (attack ?? 0) + decay + 0.05);
}

/** A tone into `out`, optionally sliding to `to` Hz. */
function tone(
  g: Graph,
  out: AudioNode,
  type: OscillatorType,
  freq: number,
  peak: number,
  decay: number,
  to?: number,
) {
  const osc = g.ctx.createOscillator();
  osc.type = type;
  const t = g.ctx.currentTime;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + decay);
  const env = envelope(g.ctx, peak, decay);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + decay + 0.05);
}

function play(g: Graph, s: Sound) {
  const pan = g.ctx.createStereoPanner();
  pan.pan.value = s.pan;
  pan.connect(g.master);
  const v = s.gain;
  switch (s.kind) {
    case "racket":
      // The strings' crack, brighter for a drive, and the frame's knock.
      noise(g, pan, "bandpass", 700 + 1800 * s.bright, 1.2, 0.9 * v, 0.05);
      tone(g, pan, "triangle", 260 + 120 * s.bright, 0.5 * v, 0.06, 180);
      break;
    case "floor":
      tone(g, pan, "sine", 110, 0.9 * v, 0.09, 60);
      noise(g, pan, "lowpass", 900, 0.7, 0.4 * v, 0.04);
      break;
    case "wall":
      noise(g, pan, "bandpass", 900, 1.5, 0.8 * v, 0.06);
      tone(g, pan, "sine", 170, 0.5 * v, 0.07, 120);
      break;
    case "penthouse":
      noise(g, pan, "bandpass", 420, 4, 0.9 * v, 0.06);
      tone(g, pan, "triangle", 320, 0.4 * v, 0.07, 260);
      // The roof's boards rumbling as the ball runs on.
      noise(g, pan, "lowpass", 260, 0.8, 0.35 * v, 0.25 + 0.2 * s.bright, 0.02);
      break;
    case "net":
      noise(g, pan, "lowpass", 500, 0.7, 0.6 * v, 0.18, 0.01);
      break;
    case "netting":
      noise(g, pan, "highpass", 2500, 0.7, 0.5 * v, 0.3, 0.03);
      noise(g, pan, "lowpass", 400, 0.7, 0.4 * v, 0.2, 0.01);
      break;
    case "grille":
      // Inharmonic partials: struck metal.
      for (const [f, a] of [
        [523, 0.5],
        [1187, 0.35],
        [1873, 0.25],
        [2731, 0.15],
      ] as const)
        tone(g, pan, "sine", f, a * v, 0.9);
      noise(g, pan, "highpass", 3000, 0.7, 0.4 * v, 0.05);
      break;
    case "bell":
      for (const [f, a, d] of [
        [880, 0.5, 2.5],
        [880 * 2.76, 0.25, 1.5],
        [880 * 5.4, 0.12, 0.8],
      ] as const)
        tone(g, pan, "sine", f, a * v, d);
      break;
    case "body":
      noise(g, pan, "lowpass", 300, 0.7, 0.7 * v, 0.08);
      break;
  }
}

/**
 * Plays a step's events. `speed` is the ball's speed (m/s) going into the
 * step, and `shotOf` the striker's shot for racket hits.
 */
export function hear(
  events: readonly SimEvent[],
  speed: number,
  shotOf?: (player: string) => ShotType | undefined,
) {
  const g = graph;
  if (!g || g.ctx.state !== "running" || volume === 0) return;
  for (const e of events) {
    const shot = e.type === "racketHit" ? shotOf?.(e.player) : undefined;
    const s = soundOf(e, speed, ear.current, shot);
    if (s) play(g, s);
  }
}

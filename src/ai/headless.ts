import type { InputState } from "../input/input.ts";
import { athleteOf, playStep, startPlay, type PlayState } from "../game/play.ts";
import { playerCapsule } from "../game/player.ts";
import type { MatchConfig } from "../rules/match.ts";
import type { PlayerId } from "../rules/rally.ts";
import { decided, strokesIn, type Rest } from "../game/summary.ts";

export type { Rest };
import type { World } from "../sim/world.ts";
import { aiInput, FRESH, type AiMemory } from "./ai.ts";
import type { AiPreset } from "./presets.ts";

/** A seeded generator of numbers in [0, 1). */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** The AI's view of a match, for the player `id`. */
export function viewOf(s: PlayState, id: PlayerId) {
  return {
    me: athleteOf(s, id),
    sim: s.sim,
    rally: s.rally,
    live: s.phase === "play",
    since: s.since,
  };
}

/**
 * Plays AI against AI until the match is won or `limit` seconds pass. Returns
 * the final state and every decided rest.
 */
export function playAi(
  world: World,
  config: MatchConfig,
  presets: Readonly<Record<PlayerId, AiPreset>>,
  seed: number,
  limit = Infinity,
  stop: (s: PlayState) => boolean = () => false,
): { readonly state: PlayState; readonly rests: readonly Rest[] } {
  const random = seeded(seed);
  let s = startPlay(
    world,
    config,
    random,
    Object.fromEntries(config.players.map((p) => [p, p])),
  ).state;
  const memory: Record<PlayerId, AiMemory> = Object.fromEntries(
    config.players.map((p) => [p, FRESH]),
  );
  const rests: Rest[] = [];
  let strokes = 0;
  while (s.phase !== "over" && s.sim.time < limit && !stop(s)) {
    const inputs: Record<PlayerId, InputState> = {};
    for (const id of config.players) {
      const r = aiInput(
        world,
        viewOf(s, id),
        presets[id]!,
        memory[id]!,
        random,
        playerCapsule(athleteOf(s, id)),
      );
      inputs[id] = r.input;
      memory[id] = r.memory;
    }
    const before = s;
    const r = playStep(world, s, inputs);
    s = r.state;
    strokes += strokesIn(before, r.events);
    const rest = decided(before, s, strokes);
    if (rest) {
      rests.push(rest);
      strokes = 0;
    }
  }
  return { state: s, rests };
}

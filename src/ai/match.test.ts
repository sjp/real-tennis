import { describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import type { MatchConfig } from "../rules/match.ts";
import type { TeachingId } from "../rules/teaching.ts";
import { createWorld } from "../sim/world.ts";
import { playAi, type Rest } from "./headless.ts";
import { AI_PRESETS } from "./presets.ts";

const world = createWorld(court);
const config: MatchConfig = { players: ["a", "b"], sets: 1, suddenDeath: false };
/** Each one-set match finishes in well under this much play. */
const LIMIT = 60 * 60;

/** Ways of losing a rest that the AI's own choices could cause. */
const BLUNDERS: readonly TeachingId[] = [
  "volleyBeforePenthouse",
  "notYetOver",
  "doubleHit",
  "touchedNet",
  "faultDoubleHit",
  "faultLine",
];

const reason = (r: Rest) => ("reason" in r.outcome ? r.outcome.reason : r.outcome.kind);

describe("AI against AI", () => {
  it("plays a set to the end without a rule-breaking blunder", () => {
    const presets = { a: AI_PRESETS.medium, b: AI_PRESETS.medium };
    const { state, rests } = playAi(world, config, presets, 1, LIMIT);
    expect(state.phase).toBe("over");
    expect(state.match.winner).not.toBeNull();
    expect(rests.map(reason).filter((r) => BLUNDERS.includes(r as TeachingId))).toEqual([]);
  });

  describe("Hard against Easy", () => {
    const presets = { a: AI_PRESETS.hard, b: AI_PRESETS.easy };
    const matches = [1, 2].map((seed) => playAi(world, config, presets, seed, LIMIT));

    it("is won by Hard", () => {
      expect(matches.map((m) => m.state.match.winner)).toEqual(["a", "a"]);
    });

    it("sees Easy lose rests in varied ways", () => {
      const lost = matches.flatMap((m) =>
        m.rests.filter((r) => r.outcome.kind !== "point" || r.outcome.winner === "a"),
      );
      expect(new Set(lost.map(reason)).size).toBeGreaterThanOrEqual(4);
    });
  });
});

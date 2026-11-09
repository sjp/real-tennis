import { beforeAll, describe, expect, it } from "vitest";
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
/** Test timeout for a whole match, or for the two Hard v Easy ones together, in ms. */
const SLOW = 20_000;

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
  it(
    "plays a set to the end without a rule-breaking blunder",
    () => {
      const presets = { a: AI_PRESETS.medium, b: AI_PRESETS.easy };
      const { state, rests } = playAi(world, config, presets, 1, LIMIT);
      expect(state.phase).toBe("over");
      expect(state.match.winner).not.toBeNull();
      expect(rests.map(reason).filter((r) => BLUNDERS.includes(r))).toEqual([]);
    },
    SLOW,
  );

  describe("Hard against Easy", () => {
    const presets = { a: AI_PRESETS.hard, b: AI_PRESETS.easy };
    let matches: ReturnType<typeof playAi>[] = [];
    beforeAll(() => {
      matches = [1, 2].map((seed) => playAi(world, config, presets, seed, LIMIT));
    }, SLOW);

    it("is won by Hard", () => {
      expect(matches.map((m) => m.state.match.winner)).toEqual(["a", "a"]);
    });

    it("sees Easy lose rests in varied ways", () => {
      const lost = matches.flatMap((m) =>
        m.rests.filter((r) => r.outcome.kind !== "point" || r.outcome.winner === "a"),
      );
      expect(new Set(lost.map(reason)).size).toBeGreaterThanOrEqual(4);
    });

    it("rarely lets the ball touch a player", () => {
      // 237: the ball hit a player in about 10% of rests when the AI ran
      // through its path.
      const rests = matches.flatMap((m) => m.rests);
      const touched = rests.filter((r) => reason(r) === "touchedByBall");
      expect(touched.length / rests.length).toBeLessThan(0.05);
    });
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { standardCourt as court } from "../court/standard.ts";
import type { MatchConfig } from "../rules/match.ts";
import { createWorld } from "../sim/world.ts";
import { playAi, type Rest } from "./headless.ts";
import { AI_PRESETS } from "./presets.ts";

const world = createWorld(court);
const config: MatchConfig = { players: ["a", "b"], sets: 1, suddenDeath: false };
/** Each one-set match finishes in well under this much play. */
const LIMIT = 60 * 60;
/**
 * Test timeout for both matches together, in ms. They take a few seconds
 * here but several times that on a CI runner, so this only catches a match
 * that never ends.
 */
const SLOW = 60_000;

const reason = (r: Rest) => ("reason" in r.outcome ? r.outcome.reason : r.outcome.kind);

// Apart from match.test.ts, so the two files' matches play in parallel.
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

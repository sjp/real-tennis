/**
 * Plays AI against AI headless and prints the results, for tuning the
 * presets (060). Usage: npm run ai:stats -- [a] [b] [sets] [first seed]
 * e.g. npm run ai:stats -- hard easy 10, or -- hard easy 10 101 for seeds 101–110
 */
import { playAi } from "../src/ai/headless.ts";
import { AI_PRESETS, type AiLevel } from "../src/ai/presets.ts";
import { standardCourt } from "../src/court/standard.ts";
import { createWorld } from "../src/sim/world.ts";

const world = createWorld(standardCourt);
const [a = "hard", b = "easy", count = "6", first = "1"] = process.argv.slice(2);
const levels = [a, b] as AiLevel[];
if (!levels.every((l) => l in AI_PRESETS))
  throw new Error(`Levels are ${Object.keys(AI_PRESETS).join(", ")}`);

const players = ["A", "B"] as const;
const presets = { A: AI_PRESETS[levels[0]!], B: AI_PRESETS[levels[1]!] };
const ways: Record<string, number> = {};
const games = { A: 0, B: 0 };
const sets = { A: 0, B: 0 };
const scores: string[] = [];
let rests = 0;
let strokes = 0;
const started = Date.now();
for (let seed = Number(first); seed < Number(first) + Number(count); seed++) {
  const config = { players, sets: 1, suddenDeath: false } as const;
  const { state, rests: played } = playAi(world, config, presets, seed);
  scores.push(players.map((p) => String(state.match.setScores[0]?.[p] ?? 0)).join("–"));
  for (const p of players) {
    games[p] += state.match.setScores[0]?.[p] ?? 0;
    sets[p] += state.match.sets[p] ?? 0;
  }
  for (const r of played) {
    const o = r.outcome;
    const way =
      o.kind === "point"
        ? `${o.winner} wins: ${o.reason}`
        : `${o.kind}: ${"reason" in o ? o.reason : ""}`;
    ways[way] = (ways[way] ?? 0) + 1;
    rests++;
    strokes += r.strokes;
  }
}

console.log(`A (${a}) v B (${b}), ${count} one-set matches from seed ${first}`);
console.log(
  `Sets ${String(sets.A)}–${String(sets.B)}, games ${String(games.A)}–${String(games.B)}`,
);
console.log(`Each set: ${scores.join(", ")}`);
console.log(`${String(rests)} rests, ${(strokes / rests).toFixed(1)} strokes a rest`);
const touched = Object.entries(ways)
  .filter(([way]) => way.endsWith("touchedByBall"))
  .reduce((n, [, k]) => n + k, 0);
console.log(`touchedByBall ${String(touched)} (${((100 * touched) / rests).toFixed(1)}% of rests)`);
for (const [way, n] of Object.entries(ways).toSorted((x, y) => y[1] - x[1]))
  console.log(`${String(n).padStart(5)}  ${way}`);
console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);

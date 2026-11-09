/**
 * Fails if a built JS chunk's gzip size is over its budget, to catch a
 * dependency or a lost code split growing the download (220). Run after
 * `npm run build`: npm run bundle:budget
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// Gzip kB per chunk name, about 10% over the sizes at 211.
const BUDGETS: Record<string, number> = {
  index: 22, // 18.7
  react: 75, // 68.3
  three: 275, // 252.6
  Sandbox: 80, // 72.2 (leva)
};
// Every other chunk: lazy screens and shared modules, the largest 10.1.
const OTHER = 15;

const dir = "dist/assets";
const rows = readdirSync(dir)
  .filter((f) => f.endsWith(".js"))
  .map((file) => {
    const name = file.replace(/-[\w-]{8}\.js$/, "");
    const kb = gzipSync(readFileSync(`${dir}/${file}`)).length / 1000;
    const budget = BUDGETS[name] ?? OTHER;
    return { name, kb, budget, over: kb > budget };
  })
  .sort((a, b) => b.kb - a.kb);
if (rows.length === 0) throw new Error(`No chunks in ${dir}; run npm run build first`);

const lines = [
  "| Chunk | Gzip kB | Budget kB | |",
  "| --- | --: | --: | --- |",
  ...rows.map(
    (r) => `| ${r.name} | ${r.kb.toFixed(1)} | ${String(r.budget)} | ${r.over ? "over" : "ok"} |`,
  ),
];
console.log(lines.join("\n"));
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) appendFileSync(summary, `### Bundle size\n\n${lines.join("\n")}\n`);

const over = rows.filter((r) => r.over);
if (over.length > 0) {
  console.error(`Over budget: ${over.map((r) => r.name).join(", ")}`);
  process.exit(1);
}

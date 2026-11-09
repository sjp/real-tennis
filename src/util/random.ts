/**
 * A seeded generator of numbers in [0, 1) (mulberry32). The seed is
 * normalised to a non-negative integer, so `seeded(-5)` is `seeded(5)` and
 * `seeded(2.7)` is `seeded(2)`.
 */
export function seeded(seed: number): () => number {
  let s = Math.abs(Math.floor(seed)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

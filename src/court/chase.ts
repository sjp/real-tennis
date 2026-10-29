import type { ChaseLine, ChaseMark, CourtDefinition } from "./types.ts";

export interface ChaseCall {
  /** The Law 9.2(b) name, e.g. "Better than Two" or "Chase the Line". */
  readonly name: string;
  readonly mark: ChaseMark;
}

/**
 * How close a Fall must be to a line to count as on it: one ball diameter.
 * The Laws leave this to the Marker.
 */
export const ON_LINE_TOLERANCE = 0.064;

/** Names a chase by Laws 9.1 and 9.2(b). */
export function chaseName(
  court: CourtDefinition,
  mark: ChaseMark,
  tolerance = ON_LINE_TOLERANCE,
): ChaseCall {
  const lines = court.chaseLines
    .filter((l) => l.side === mark.side)
    .toSorted((a, b) => a.distance - b.distance);
  const d = mark.distance;
  const call = (name: string): ChaseCall => ({ name, mark });

  const onLine = nearest(lines, d);
  if (Math.abs(onLine.distance - d) <= tolerance) return call(onLine.name);

  // Law 9.2(b)(i): nearer the back wall than the first line.
  const first = lines[0]!;
  if (d < first.distance) return call(`Better than ${first.name}`);

  // Law 9.2(b)(iii): worse than the First Gallery line.
  if (d > lines.at(-1)!.distance) {
    return call(mark.side === "service" ? "Chase the Line" : "Hazard Chase the Line");
  }

  // Law 9.2(b): named after the nearest yard or gallery line.
  const named = nearest(
    lines.filter((l) => l.kind !== "halfYard"),
    d,
  );
  const better = d < named.distance;
  // Law 9.2(b)(ii).
  if (named.id === "aYardWorseThanLastGallery") {
    return call(`${better ? "Nearly" : "More than"} a Yard Worse than the Last Gallery`);
  }
  return call(`${better ? "Better" : "Worse"} than ${named.name}`);
}

/** The call with its metric distance, e.g. "Better than Two (1.71 m)". */
export function chaseLabel(call: ChaseCall): string {
  const from = call.mark.side === "service" ? "" : " from the Service Line";
  return `${call.name} (${call.mark.distance.toFixed(2)} m${from})`;
}

function nearest(lines: readonly ChaseLine[], d: number): ChaseLine {
  return lines.reduce((best, l) =>
    Math.abs(l.distance - d) < Math.abs(best.distance - d) ? l : best,
  );
}

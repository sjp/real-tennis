/** Seconds from pressing swing to the racket meeting the ball. ⚠ verify */
export const SWING_TIME = 0.25;

/** Timing windows, in seconds either side of perfect. ⚠ verify */
export const PERFECT = 0.03;
export const GOOD = 0.09;
export const POOR = 0.15;

/** Most a shot is pulled or pushed off line, in radians. */
export const MAX_PULL = (15 * Math.PI) / 180;

export type Grade = "perfect" | "good" | "poor" | "miss";

export interface Timing {
  readonly grade: Grade;
  /** Seconds the swing was early (positive) or late (negative). */
  readonly error: number;
  /** Strike quality for `racketImpact`: 1 is the sweet spot. */
  readonly quality: number;
  /**
   * How far the shot goes off line, in radians, turning towards the
   * striker's left (positive) or right. Early pulls a forehand left and a
   * backhand right; late pushes the other way.
   */
  readonly pull: number;
}

/**
 * Grades a swing. `error` is when the ball reaches the ideal contact point
 * minus when the racket gets there, so a positive error is an early swing.
 */
export function grade(error: number, backhand: boolean): Timing {
  const e = Math.abs(error);
  if (e > POOR) return { grade: "miss", error, quality: 0, pull: 0 };
  const g: Grade = e <= PERFECT ? "perfect" : e <= GOOD ? "good" : "poor";
  // Full quality inside the perfect window, then falling to 0.75 and 0.3.
  const quality =
    e <= PERFECT
      ? 1
      : e <= GOOD
        ? 1 - (0.25 * (e - PERFECT)) / (GOOD - PERFECT)
        : 0.75 - (0.45 * (e - GOOD)) / (POOR - GOOD);
  // Inside the perfect window the shot goes where it was aimed.
  const off = Math.max(0, e - PERFECT) / (POOR - PERFECT);
  const pull = Math.sign(error) * (backhand ? -1 : 1) * off * MAX_PULL;
  return { grade: g, error, quality, pull };
}

import type { InputState } from "../input/input.ts";
import { STEP } from "../sim/world.ts";

/** The longest frame counted, so a stall (a hidden tab, a GC) doesn't race the sim. */
export const MAX_DELTA = 0.1;

/**
 * The fixed-step core shared by the playing screens (210). Adds the frame's
 * `delta` to `acc`, then takes whole steps while there's time and play isn't
 * paused. The input's presses (swing, select) go to the first step only.
 * Returns the time left over, less than one step unless paused mid-frame.
 */
export function advance(
  acc: number,
  delta: number,
  input: InputState,
  isPaused: () => boolean,
  step: (input: InputState) => void,
): number {
  acc += Math.min(delta, MAX_DELTA);
  while (acc >= STEP && !isPaused()) {
    step(input);
    input = { ...input, swing: false, select: null };
    acc -= STEP;
  }
  return acc;
}

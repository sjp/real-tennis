import { clampMove, type InputState } from "./input.ts";

/** The joystick's reach, in CSS pixels. ⚠ verify on a phone. */
export const STICK_RADIUS = 56;

export interface Stick {
  /** Where the thumb landed: the joystick's centre. */
  readonly origin: { readonly x: number; readonly y: number };
  /** Where the thumb is now. */
  readonly at: { readonly x: number; readonly y: number };
}

/**
 * Touch input (080): a floating joystick where the left thumb lands, and
 * buttons. The player always sprints (170). The screen feeds it pointer positions; the game reads it like
 * the keyboard.
 */
export interface Touch {
  readonly stickStart: (id: number, x: number, y: number) => void;
  readonly stickMove: (id: number, x: number, y: number) => void;
  readonly stickEnd: (id: number) => void;
  /** The joystick, for drawing, or null when no thumb is on it. */
  readonly stick: () => Stick | null;
  readonly swing: () => void;
  readonly select: (n: number) => void;
  /** The current input. Presses since the last read count once. */
  readonly read: () => InputState;
  /** Lets go of everything, e.g. when the controls go away mid-touch (200). */
  readonly reset: () => void;
}

export function touch(): Touch {
  let id: number | null = null;
  let stick: Stick | null = null;
  let swing = false;
  let select: number | null = null;

  return {
    stickStart(pointer, x, y) {
      // A second finger doesn't take over a thumb that's still down.
      if (id !== null) return;
      id = pointer;
      stick = { origin: { x, y }, at: { x, y } };
    },
    stickMove(pointer, x, y) {
      if (pointer === id && stick) stick = { ...stick, at: { x, y } };
    },
    stickEnd(pointer) {
      if (pointer !== id) return;
      id = null;
      stick = null;
    },
    stick: () => stick,
    swing() {
      swing = true;
    },
    select(n) {
      select = n;
    },
    read() {
      let move = { x: 0, y: 0 };
      if (stick) {
        const dx = (stick.at.x - stick.origin.x) / STICK_RADIUS;
        // Screen y runs down; forwards is up.
        const dy = (stick.origin.y - stick.at.y) / STICK_RADIUS;
        move = clampMove(dx, dy);
      }
      const input: InputState = { move, sprint: true, swing, select };
      swing = false;
      select = null;
      return input;
    },
    reset() {
      id = null;
      stick = null;
      swing = false;
      select = null;
    },
  };
}

/** Two inputs at once, e.g. keyboard and touch: the bigger move, and either's presses. */
export function mergeInputs(a: InputState, b: InputState): InputState {
  return {
    move: Math.hypot(b.move.x, b.move.y) > Math.hypot(a.move.x, a.move.y) ? b.move : a.move,
    sprint: a.sprint || b.sprint,
    swing: a.swing || b.swing,
    select: b.select ?? a.select,
  };
}

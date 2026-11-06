import { clampMove, type InputState } from "./input.ts";

/** The joystick's reach, in CSS pixels. ⚠ verify on a phone. */
export const STICK_RADIUS = 56;
/** Pushed this far past the rim (as a fraction of the reach), the player sprints. */
export const SPRINT_PAST = 1.35;

export interface Stick {
  /** Where the thumb landed: the joystick's centre. */
  readonly origin: { readonly x: number; readonly y: number };
  /** Where the thumb is now. */
  readonly at: { readonly x: number; readonly y: number };
}

/**
 * Touch input (080): a floating joystick where the left thumb lands, and
 * buttons. The screen feeds it pointer positions; the game reads it like
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
  readonly sprint: (held: boolean) => void;
  /** The current input. Presses since the last read count once. */
  readonly read: () => InputState;
}

export function touch(): Touch {
  let id: number | null = null;
  let stick: Stick | null = null;
  let swing = false;
  let select: number | null = null;
  let sprint = false;

  return {
    stickStart(pointer, x, y) {
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
    sprint(held) {
      sprint = held;
    },
    read() {
      let move = { x: 0, y: 0 };
      let far = false;
      if (stick) {
        const dx = (stick.at.x - stick.origin.x) / STICK_RADIUS;
        // Screen y runs down; forwards is up.
        const dy = (stick.origin.y - stick.at.y) / STICK_RADIUS;
        move = clampMove(dx, dy);
        far = Math.hypot(dx, dy) >= SPRINT_PAST;
      }
      const input: InputState = { move, sprint: sprint || far, swing, select };
      swing = false;
      select = null;
      return input;
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

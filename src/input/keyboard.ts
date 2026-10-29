import { clampMove, type InputState } from "./input.ts";

const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const UP = ["KeyW", "ArrowUp"];
const DOWN = ["KeyS", "ArrowDown"];
const SPRINT = ["ShiftLeft", "ShiftRight"];

export interface Keyboard {
  /** The current input. Presses since the last read count once. */
  read(): InputState;
  dispose(): void;
}

/** WASD/arrows to move, Space to swing, Shift to sprint, 1–8 to pick a shot. */
export function keyboard(target: Window = window): Keyboard {
  const held = new Set<string>();
  let swing = false;
  let select: number | null = null;

  const down = (e: KeyboardEvent) => {
    if (e.repeat) return;
    held.add(e.code);
    if (e.code === "Space") {
      swing = true;
      e.preventDefault();
    }
    const digit = /^Digit([1-8])$/.exec(e.code);
    if (digit) select = Number(digit[1]);
  };
  const up = (e: KeyboardEvent) => held.delete(e.code);
  // Keys held when the window loses focus never see their keyup.
  const blur = () => held.clear();
  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  target.addEventListener("blur", blur);

  const any = (codes: readonly string[]) => codes.some((c) => held.has(c));
  const axis = (minus: readonly string[], plus: readonly string[]) =>
    Number(any(plus)) - Number(any(minus));

  return {
    read() {
      const input: InputState = {
        move: clampMove(axis(LEFT, RIGHT), axis(DOWN, UP)),
        sprint: any(SPRINT),
        swing,
        select,
      };
      swing = false;
      select = null;
      return input;
    },
    dispose() {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener("blur", blur);
    },
  };
}

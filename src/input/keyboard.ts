import { clampMove, type InputState } from "./input.ts";

const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const UP = ["KeyW", "ArrowUp"];
const DOWN = ["KeyS", "ArrowDown"];

export interface Keyboard {
  /** The current input. Presses since the last read count once. */
  read(): InputState;
  dispose(): void;
}

/** Whether Ctrl, Cmd or Alt is held: a browser shortcut, not a game key (202). */
export function withModifier(e: {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

type Target = Pick<Window, "addEventListener" | "removeEventListener">;

/** WASD/arrows to move (always sprinting, 170), Space to swing, 1–8 to pick a shot. */
export function keyboard(
  target: Target = window,
  doc: (Target & { readonly visibilityState: DocumentVisibilityState }) | null = typeof document ===
  "undefined"
    ? null
    : document,
): Keyboard {
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
  // Keys held when the window loses focus, or the tab is hidden, never see
  // their keyup. Nor, on macOS, do keys released while Cmd is held (202).
  const clear = () => {
    held.clear();
  };
  const up = (e: KeyboardEvent) => {
    if (e.code === "MetaLeft" || e.code === "MetaRight") clear();
    else held.delete(e.code);
  };
  const hidden = () => {
    if (doc?.visibilityState === "hidden") clear();
  };
  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  target.addEventListener("blur", clear);
  doc?.addEventListener("visibilitychange", hidden);

  const any = (codes: readonly string[]) => codes.some((c) => held.has(c));
  const axis = (minus: readonly string[], plus: readonly string[]) =>
    Number(any(plus)) - Number(any(minus));

  return {
    read() {
      const input: InputState = {
        move: clampMove(axis(LEFT, RIGHT), axis(DOWN, UP)),
        sprint: true,
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
      target.removeEventListener("blur", clear);
      doc?.removeEventListener("visibilitychange", hidden);
    },
  };
}

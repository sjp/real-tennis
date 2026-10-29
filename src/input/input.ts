/** Shot types (040). The server picks a serve style instead. */
export type ShotType = "drive" | "cut" | "lob" | "boast";

export const SHOT_TYPES: readonly ShotType[] = ["drive", "cut", "lob", "boast"];

/**
 * What a player is asking for this frame. Keyboard, touch (080) and the AI
 * (060) all produce this, so the game code doesn't care which it is.
 */
export interface InputState {
  /**
   * Camera-relative: x to the right, y forwards (towards the net). Its
   * length is at most 1, so a joystick can ask for less than full speed.
   */
  readonly move: { readonly x: number; readonly y: number };
  readonly sprint: boolean;
  /** True only on the frame the swing button goes down. */
  readonly swing: boolean;
  /** The shot (1–4) or serve style (1–8) picked this frame, or null. */
  readonly select: number | null;
}

export const IDLE: InputState = { move: { x: 0, y: 0 }, sprint: false, swing: false, select: null };

/** Limits `move` to length 1. */
export function clampMove(x: number, y: number): InputState["move"] {
  const l = Math.hypot(x, y);
  return l > 1 ? { x: x / l, y: y / l } : { x, y };
}

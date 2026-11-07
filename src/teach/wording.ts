/** How the player is playing: what the teaching text should tell them to press. */
export type Controls = "keys" | "touch";

/** Phrases that name controls, written into teaching text as `{name}`. */
export const PHRASES: Readonly<Record<string, Readonly<Record<Controls, string>>>> = {
  move: {
    keys: "Move with WASD or the arrow keys.",
    touch: "Move with your thumb on the left of the screen.",
  },
  swing: { keys: "Press Space", touch: "Tap Swing" },
  again: { keys: "press Space again", touch: "tap Swing again" },
  serves: {
    keys: "Keys 1–8 choose different serves.",
    touch: "The Serve button above Swing chooses different serves.",
  },
  hold: { keys: "Hold", touch: "Hold the joystick" },
  lob: { keys: "lob (3)", touch: "Lob" },
  holdingBack: { keys: "with back (S) held", touch: "with the joystick held back" },
  rules: { keys: "Press ? at any time for the rules.", touch: "The ❚❚ menu has the rules." },
  toss: {
    keys: "Toss with Space, then swing with Space as the ball drops past you.",
    touch: "Tap Swing to toss, then tap it again as the ball drops past you.",
  },
};

/** `text` with each `{phrase}` worded for `controls`. */
export function word(text: string, controls: Controls): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) => PHRASES[name]?.[controls] ?? all);
}

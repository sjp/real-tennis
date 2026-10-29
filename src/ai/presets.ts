export type AiLevel = "easy" | "medium" | "hard";

/** How well the AI plays. ⚠ verify, all of them: starting points to tune in play. */
export interface AiPreset {
  /** Seconds before it reacts to the ball changing course. */
  readonly reaction: number;
  /** How far off its idea of where to stand is, in metres per second ahead. */
  readonly noise: number;
  /** Spread of its swing timing, in seconds. */
  readonly timing: number;
  /** Its top speed, as a fraction of a sprint. */
  readonly speed: number;
  /** Spread of its aim, as move input. */
  readonly aim: number;
  /** How often it goes for a winner rather than a safe cut. */
  readonly ambition: number;
  /** How often it plays a boast. */
  readonly boast: number;
  /** How often it weighs up letting the ball go. */
  readonly judgement: number;
  /** It lets the ball go when leaving it is worth more than this (0 to 1). */
  readonly keep: number;
  /** Weights for each of SERVE_STYLES. */
  readonly serves: readonly number[];
}

export const AI_PRESETS: Readonly<Record<AiLevel, AiPreset>> = {
  easy: {
    reaction: 0.35,
    noise: 0.35,
    timing: 0.08,
    speed: 0.6,
    aim: 0.5,
    ambition: 0.05,
    boast: 0.1,
    judgement: 0.1,
    keep: 0.6,
    serves: [4, 1, 0, 1, 0, 0, 0, 0],
  },
  medium: {
    reaction: 0.25,
    noise: 0.2,
    timing: 0.05,
    speed: 0.75,
    aim: 0.3,
    ambition: 0.15,
    boast: 0.05,
    judgement: 0.5,
    keep: 0.6,
    serves: [4, 1, 2, 1, 1, 0, 1, 0],
  },
  hard: {
    reaction: 0.15,
    noise: 0.08,
    timing: 0.025,
    speed: 0.9,
    aim: 0.15,
    ambition: 0.3,
    boast: 0.05,
    judgement: 0.95,
    keep: 0.6,
    serves: [3, 1, 2, 1, 2, 1, 1, 1],
  },
};

import type { ChaseCall } from "../court/chase.ts";
import type { ShotType } from "../input/input.ts";
import { SERVE_STYLES } from "../player/serve.ts";
import type { MatchState } from "../rules/match.ts";

/** The opponent's kit colour. */
export const OPPONENT_TRIM = "#b5443c";

/** State owned outside React, stepped every frame. */
export interface Store<S> {
  readonly get: () => S;
  readonly set: (s: S) => void;
}

export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  return {
    get: () => state,
    set: (s) => {
      state = s;
    },
  };
}

/** The shot or serve style chosen, for the HUD. */
export function choiceOf(a: {
  readonly serve: unknown;
  readonly serveStyle: number;
  readonly shot: ShotType;
}): string {
  return a.serve !== null ? `Serve: ${SERVE_STYLES[a.serveStyle]!.name}` : `Shot: ${a.shot}`;
}

/** The chases to show: being played off, or laid. */
export interface Chases {
  readonly chases: readonly ChaseCall[];
  readonly playingOff: boolean;
}

export function chasesOf(m: MatchState): Chases {
  return m.playOff.length > 0
    ? { chases: m.playOff, playingOff: true }
    : { chases: m.chases, playingOff: false };
}

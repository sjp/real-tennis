import { standardCourt as court } from "../court/standard.ts";
import type { FloorPoint, Side } from "../court/types.ts";
import type { Notice } from "../game/player.ts";
import { PLAYER_ID } from "../game/practice.ts";
import type { SimEvent } from "../sim/events.ts";

/** Camera placement behind the player. ⚠ verify in play. */
export const BEHIND = 5;
export const ABOVE = 3.8;

/** Where the camera starts, behind a player at `at`. */
export function cameraStart(at: FloorPoint, end: Side): [number, number, number] {
  const f = end === "service" ? 1 : -1;
  return [at.x, ABOVE, at.z - f * BEHIND];
}

/**
 * The canvas's device pixel ratio: capped, as phones' 3× screens cost far more
 * than they show. ⚠ verify on a phone.
 */
export const DPR: [number, number] = [
  1,
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? 1.5 : 2,
];

/** Show the frame-rate meter: `?fps`. */
export const FPS =
  typeof location !== "undefined" && new URLSearchParams(location.search).has("fps");

/** Teaching highlights. */
export const HIGHLIGHT = "#4cc9f0";

/** The HUD's panels. */
export const panel = {
  position: "absolute",
  margin: 0,
  padding: "8px 12px",
  font: "13px/1.5 ui-monospace, monospace",
  color: "#e8e8e8",
  background: "rgba(0, 0, 0, 0.6)",
  borderRadius: 6,
} as const;

/** The HUD in the top left: half the screen at most, leaving room for the touch buttons. */
export const hudPanel = { ...panel, left: 12, top: 12, maxWidth: "min(520px, 48vw)" } as const;

/** A panel in the middle of the screen that fits a phone. */
export const centred = {
  ...panel,
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  // Not shrunk to the half of the screen right of `left`.
  width: "max-content",
  maxWidth: "min(520px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 32px)",
  overflow: "auto",
  boxSizing: "border-box",
} as const;

/** The player's last stroke, and whether it clears the last event. */
export function describeNotice(n: Notice): { last?: string; event?: null } {
  switch (n.type) {
    case "whiff":
      return { last: "Missed it" };
    // The rules engine calls these.
    case "serverFault":
      return {};
    case "shot": {
      const ms = Math.round(Math.abs(n.timing.error) * 1000);
      const when =
        n.timing.grade === "perfect" ? "" : ` · ${n.timing.error > 0 ? "early" : "late"} ${ms} ms`;
      return { last: `${n.shot}: ${n.timing.grade}${when}`, event: null };
    }
  }
}

export function describeEvent(e: SimEvent): string | null {
  switch (e.type) {
    case "enteredOpening":
      return `Into ${court.openings.find((o) => o.id === e.opening)!.name}`;
    case "outOfCourt":
      return "Out of court";
    case "playerHit":
      return e.player === PLAYER_ID ? "The ball hit you" : "The ball hit your opponent";
    case "netHit":
      return e.cord ? "Off the net cord" : "Into the net";
    default:
      return null;
  }
}

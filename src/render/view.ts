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

import type { Vec3 } from "../court/types.ts";
import type { ShotType } from "../input/input.ts";
import type { SimEvent } from "../sim/events.ts";

export type SoundKind =
  | "racket"
  | "floor"
  | "wall"
  /** A wooden knock and a short rumble: a run of them is the ball rolling down the roof. */
  | "penthouse"
  | "net"
  /** Netting: the dedans and the galleries. */
  | "netting"
  | "grille"
  | "bell"
  | "body";

export interface Sound {
  readonly kind: SoundKind;
  /** 0 to 1, before the master volume. */
  readonly gain: number;
  /** Left −1 to right 1. */
  readonly pan: number;
  /** Brightness, 0 (dull) to 1 (bright): a cut is duller than a drive. */
  readonly bright: number;
}

/** Where the sound is heard from: the camera. */
export interface Ear {
  readonly position: Vec3;
  /** Unit vector to the listener's right. */
  readonly right: Vec3;
}

/** How bright each stroke sounds. ⚠ verify by ear. */
const BRIGHT: Record<ShotType, number> = { cut: 0.25, lob: 0.45, drive: 0.85, boast: 0.7 };

/** Ball speeds (m/s) that make a full-volume sound. ⚠ verify by ear. */
const LOUD = { racket: 30, floor: 18, wall: 20, penthouse: 14, net: 15, body: 15 } as const;
/** Quieter than this isn't worth playing. */
const FLOOR_GAIN = 0.03;
/** Distance (m) at which a sound is half as loud. */
const HALF = 12;

function kindOf(e: SimEvent): SoundKind | null {
  switch (e.type) {
    case "racketHit":
      return "racket";
    case "floorBounce":
      return "floor";
    case "wallHit":
    case "tambourHit":
    case "nick":
      return "wall";
    case "penthouseHit":
      return "penthouse";
    case "netHit":
      return "net";
    case "playerHit":
      return "body";
    case "enteredOpening":
      return e.opening === "grille"
        ? "grille"
        : e.opening === "winningGallery"
          ? "bell"
          : "netting";
    default:
      return null;
  }
}

/**
 * The sound of an event, heard at `ear`, with the ball at `speed` (m/s), or
 * null for silent events. `shot` is the striker's, for a racket hit.
 */
export function soundOf(e: SimEvent, speed: number, ear: Ear, shot?: ShotType): Sound | null {
  const kind = kindOf(e);
  if (!kind) return null;
  // Openings always sound in full: they win the rest.
  const loud = kind in LOUD ? Math.min(1, speed / LOUD[kind as keyof typeof LOUD]) : 1;
  const dx = e.position.x - ear.position.x;
  const dy = e.position.y - ear.position.y;
  const dz = e.position.z - ear.position.z;
  const d = Math.hypot(dx, dy, dz);
  const gain = loud / (1 + d / HALF);
  if (gain < FLOOR_GAIN) return null;
  const side = d > 0 ? (dx * ear.right.x + dy * ear.right.y + dz * ear.right.z) / d : 0;
  return {
    kind,
    gain,
    pan: Math.max(-1, Math.min(1, side)),
    bright: kind === "racket" ? BRIGHT[shot ?? "drive"] : loud,
  };
}

import type { CourtDefinition, FloorPoint, Side } from "../court/types.ts";
import type { InputState } from "../input/input.ts";

export interface PlayerParams {
  readonly runSpeed: number;
  readonly sprintSpeed: number;
  readonly acceleration: number;
  /** Radius of the body, for keeping clear of the walls. */
  readonly radius: number;
  readonly height: number;
  /** The body never comes closer than this to the net (Law 11.2(h)). */
  readonly netClearance: number;
}

/** ⚠ verify, all of them: estimates to tune in play. */
export const standardPlayer: PlayerParams = {
  runSpeed: 4.5,
  sprintSpeed: 6.5,
  acceleration: 12,
  radius: 0.3,
  height: 1.8,
  netClearance: 0.6,
};

export interface Motion {
  readonly position: FloorPoint;
  readonly velocity: FloorPoint;
}

/** Which way is forwards (towards the net) for a player at this end. */
export const forwardZ = (end: Side): number => (end === "service" ? 1 : -1);

/** Turns camera-relative input into a floor direction. The camera looks down the court. */
export function moveDirection(move: InputState["move"], end: Side): FloorPoint {
  const f = forwardZ(end);
  // Looking along +z, the camera's right is -x.
  return { x: -move.x * f, z: move.y * f };
}

/** Keeps the body on its end of the floor, clear of the walls, net and tambour. */
export function clampToEnd(
  court: CourtDefinition,
  params: PlayerParams,
  end: Side,
  p: FloorPoint,
): FloorPoint {
  const hw = court.floor.width / 2;
  const hl = court.floor.length / 2;
  const r = params.radius;
  const [z0, z1] =
    end === "service" ? [-hl + r, -params.netClearance] : [params.netClearance, hl - r];
  const z = Math.min(z1, Math.max(z0, p.z));
  // A box round the tambour, its angled face included.
  const inTambour = z > hl - court.tambour.edge - r;
  const x0 = -hw + r + (inTambour ? court.tambour.projection : 0);
  return { x: Math.min(hw - r, Math.max(x0, p.x)), z };
}

/** Accelerates towards the requested velocity, then moves and clamps. */
export function move(
  court: CourtDefinition,
  params: PlayerParams,
  m: Motion,
  input: InputState,
  end: Side,
  dt: number,
): Motion {
  const dir = moveDirection(input.move, end);
  const top = input.sprint ? params.sprintSpeed : params.runSpeed;
  const want = { x: dir.x * top, z: dir.z * top };
  const dx = want.x - m.velocity.x;
  const dz = want.z - m.velocity.z;
  const gap = Math.hypot(dx, dz);
  const k = gap > 0 ? Math.min(1, (params.acceleration * dt) / gap) : 0;
  let velocity = { x: m.velocity.x + dx * k, z: m.velocity.z + dz * k };
  const target = { x: m.position.x + velocity.x * dt, z: m.position.z + velocity.z * dt };
  const position = clampToEnd(court, params, end, target);
  // Stop dead against whatever we ran into.
  if (position.x !== target.x) velocity = { ...velocity, x: 0 };
  if (position.z !== target.z) velocity = { ...velocity, z: 0 };
  return { position, velocity };
}

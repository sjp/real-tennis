import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3, type Mesh } from "three";
import { standardCourt as court } from "../court/standard.ts";
import type { FloorPoint, Side, Vec3 } from "../court/types.ts";
import { ABOVE, BEHIND } from "./view.ts";
import { assist, type Assist } from "../game/assist.ts";
import type { Motion } from "../player/movement.ts";
import { secondGalleryLineZ } from "../player/serve.ts";
import { createWorld, predict, type Prediction, type SimState } from "../sim/world.ts";

const world = createWorld(court);
const hw = court.floor.width / 2;
const hl = court.floor.length / 2;

const LOOK_AHEAD = 8;
/** Seconds for the camera to settle; about 1 s to swing round on a change of ends. */
const FOLLOW = 0.15;
const TURN = 0.3;
/** Seconds of ball flight the hit assist looks ahead. */
const ASSIST_HORIZON = 3;

/** While the ball is live, how far the view turns towards it (0–1). ⚠ verify in play. */
const WATCH = 0.4;
/** How far the camera slides sideways, away from the ball, to keep it in view. */
const SHIFT = 0.5;
/** Camera height once behind the end wall: below the end penthouse, whose underside isn't drawn. */
const UNDER = 2;

/** Camera height at `z`: dropping beneath the end penthouse as the camera nears the end wall. */
function cameraHeight(z: number): number {
  const p = court.penthouses;
  const depth = z > 0 ? p.depth.grille : p.depth.dedans;
  const into = (Math.abs(z) - (court.floor.length / 2 - depth)) / depth;
  return ABOVE + (UNDER - ABOVE) * Math.max(0, Math.min(1, into));
}

/**
 * Keeps the camera behind and above a player, looking down the court. While
 * the ball is live it turns part way towards the ball, so a service coming
 * past the receiver stays in view. Near the end wall the camera drops below
 * the penthouse and may sit behind the wall, which is drawn one-sided and so
 * seen through, like the view from the dedans. Swings round on a change of
 * ends. Given a `focus`, it leaves the player to look at that from mid-court.
 */
export function FollowCamera({
  target,
}: {
  target: () => { at: FloorPoint; end: Side; ball: Vec3 | null; focus?: Vec3 | null };
}) {
  const camera = useThree((s) => s.camera);
  const look = useRef(new Vector3(0, 1, 0));
  const yaw = useRef<number | null>(null);
  useFrame((_, delta) => {
    const { at, end, ball, focus } = target();
    const k = Math.min(1, delta / FOLLOW);
    if (focus) {
      const away = focus.z > 0 ? -1 : 1;
      const from = new Vector3(focus.x * 0.3, 7, focus.z + away * 10);
      from.z = Math.max(-hl, Math.min(hl, from.z));
      camera.position.lerp(from, k / 3);
      look.current.lerp(new Vector3(focus.x, focus.y, focus.z), k / 3);
      camera.lookAt(look.current);
      return;
    }
    const want = end === "service" ? 0 : Math.PI;
    yaw.current ??= want;
    let turn = want - yaw.current;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    yaw.current += turn * Math.min(1, delta / TURN);
    const fx = Math.sin(yaw.current);
    const fz = Math.cos(yaw.current);
    const { x, z } = at;
    const w = ball ? WATCH : 0;
    const bx = ball?.x ?? x;
    const cx = x - fx * BEHIND - SHIFT * w * (bx - x);
    const cz = z - fz * BEHIND;
    camera.position.lerp(
      new Vector3(Math.max(-hw + 0.3, Math.min(hw - 0.3, cx)), cameraHeight(cz), cz),
      k,
    );
    const ahead = new Vector3(x + fx * LOOK_AHEAD, 0.5, z + fz * LOOK_AHEAD);
    const watched = ball ? new Vector3(ball.x, Math.min(ball.y, 2), ball.z) : ahead;
    // Part player, part ball, part down the court.
    const aim = new Vector3(x, 0.5, z)
      .multiplyScalar(w * 0.75)
      .addScaledVector(watched, w)
      .addScaledVector(ahead, 1 - w * 1.75);
    look.current.lerp(aim, k);
    camera.lookAt(look.current);
  });
  return null;
}

/**
 * The hit-assist rings: where the ball next bounces, and where the player can
 * first reach it. Re-predicts whenever the ball changes course, and a few
 * times a second.
 */
export function AssistRings({
  view,
  on,
}: {
  view: () => { sim: SimState; motion: Motion; end: Side };
  on: boolean;
}) {
  const bounceRing = useRef<Mesh>(null);
  const interceptRing = useRef<Mesh>(null);
  const plan = useRef<{ prediction: Prediction | null; at: number; key: string }>({
    prediction: null,
    at: -1,
    key: "",
  });
  useFrame(() => {
    const { sim, motion, end } = view();
    const p = plan.current;
    const key = `${sim.lastHitTime}|${sim.lastFloorTime}|${sim.lastWallTime}|${sim.asleep}`;
    if (key !== p.key || sim.time - p.at > 0.25 || sim.time < p.at) {
      p.prediction = sim.asleep ? null : predict(world, sim, ASSIST_HORIZON);
      p.at = sim.time;
      p.key = key;
    }
    const rings: Assist = p.prediction
      ? assist(p.prediction, motion, end, sim.time)
      : { bounce: null, intercept: null };
    for (const [mesh, at] of [
      [bounceRing.current, rings.bounce],
      [interceptRing.current, rings.intercept],
    ] as const) {
      if (!mesh) continue;
      mesh.visible = on && at !== null;
      if (at) mesh.position.set(at.x, 0.01, at.z);
    }
  });
  return (
    <>
      <mesh ref={bounceRing} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.18, 0.24, 32]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.8} />
      </mesh>
      <mesh ref={interceptRing} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.3, 0.38, 32]} />
        <meshBasicMaterial color="#06d6a0" transparent opacity={0.8} />
      </mesh>
    </>
  );
}

/** The Second Gallery line, lit up while serving (Law 8.1(d)(i)). */
export function ServeLine({ visible }: { visible: () => boolean }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    if (mesh.current) mesh.current.visible = visible();
  });
  return (
    <mesh
      ref={mesh}
      position={[0, 0.004, secondGalleryLineZ(court)]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[court.floor.width, 0.1]} />
      <meshBasicMaterial color="#ff5d5d" />
    </mesh>
  );
}

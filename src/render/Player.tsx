import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { ExtrudeGeometry, Shape, Vector3, type Group } from "three";
import { timeSwing, FOLLOW_THROUGH } from "../game/practice.ts";
import { standardPlayer } from "../player/movement.ts";
import { SERVE_STYLES } from "../player/serve.ts";
import { SWING_TIME } from "../player/timing.ts";
import { ARM, groundstrokeArm, HANDLE_LENGTH, HEAD_LENGTH, serveArm } from "./serveArm.ts";
import type { Store } from "./Practice.tsx";

const DEG = Math.PI / 180;

/**
 * The lopsided real tennis racket head, in its own plane: y along the
 * racket, x across. The top bulges to one side.
 */
function headGeometry(): ExtrudeGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.075, 0.02, 0.095, 0.15, 0.065, HEAD_LENGTH);
  s.bezierCurveTo(0.03, HEAD_LENGTH + 0.015, -0.04, HEAD_LENGTH - 0.03, -0.06, 0.16);
  s.bezierCurveTo(-0.07, 0.08, -0.04, 0.02, 0, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -0.0075);
  return g;
}

/**
 * Racket angle about the shoulder, in degrees, through the swing: back to
 * contact (0, racket out to the side) and on into the follow-through.
 */
function armAngle(t: number): number {
  if (t < 0) return -20;
  if (t < SWING_TIME) {
    const k = t / SWING_TIME;
    // Take the racket back quickly, then accelerate through.
    return k < 0.35 ? -20 - (k / 0.35) * 90 : -110 + ((k - 0.35) / 0.65) * 110;
  }
  return Math.min(90, ((t - SWING_TIME) / FOLLOW_THROUGH) * 90);
}

const SKIN = "#e0b48c";
const SHIRT = "#3a6ea5";
const TROUSERS = "#e8e2d0";
const SHOES = "#2b2b2b";
const HAIR = "#4a3222";

const HIP = 0.92;
/** The racket arm's pivot height. */
const SHOULDER_Y = standardPlayer.height - 0.38;
const LEG = HIP - 0.06;
const SHOULDER_WIDTH = 0.21;
/** Stride angle at full running speed, and steps per metre. */
const STRIDE = 35 * DEG;
const STEPS_PER_METRE = 1.4;
/** How far the free arm is held out from the side. */
const FREE_ARM_OUT = 30 * DEG;

/** A limb hanging down from its pivot: a tapered cylinder of `length`. */
function Limb({
  length,
  top,
  bottom,
  color,
}: {
  length: number;
  top: number;
  bottom: number;
  color: string;
}) {
  return (
    <mesh position={[0, -length / 2, 0]}>
      <cylinderGeometry args={[top, bottom, length, 8]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

export function Player({ store }: { store: Store }) {
  const body = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const free = useRef<Group>(null);
  const wrist = useRef<Group>(null);
  const legs = useRef<(Group | null)[]>([]);
  const stride = useRef({ phase: 0, last: 0 });
  const head = useMemo(() => headGeometry(), []);
  const { height, runSpeed } = standardPlayer;
  const shoulder = SHOULDER_Y + 0.03;

  useFrame(() => {
    const s = store.get();
    if (!body.current || !arm.current) return;
    body.current.position.set(s.motion.position.x, 0, s.motion.position.z);
    body.current.rotation.y = s.end === "service" ? 0 : Math.PI;
    let angle = -20;
    let backhand = false;
    if (s.swing) {
      angle = armAngle(s.sim.time - s.swing.start);
      backhand = s.swing.contact ? s.swing.backhand : (timeSwing(s, s.swing)?.backhand ?? false);
    }
    // Facing +z the right is -x. The arm points along its local +x; turn it
    // so 0° is straight out to the side and positive angles come forwards.
    arm.current.position.x = backhand ? SHOULDER_WIDTH : -SHOULDER_WIDTH;
    if (s.swing?.serve) {
      const style = SERVE_STYLES[s.serveStyle]!;
      const pivot = new Vector3(-SHOULDER_WIDTH, SHOULDER_Y, 0);
      const idle = groundstrokeArm(-20, false);
      const t = s.sim.time - s.swing.start;
      const pose = serveArm(t, style.overarm, style.contactHeight, pivot, idle);
      arm.current.quaternion.copy(pose.arm);
      wrist.current?.rotation.set(0, 0, pose.wrist);
    } else {
      arm.current.quaternion.copy(groundstrokeArm(angle, backhand));
      wrist.current?.rotation.set(0, 0, ARM.wrist);
    }

    // Legs and the free arm swing with the distance run.
    const st = stride.current;
    const dt = Math.max(0, Math.min(0.1, s.sim.time - st.last));
    st.last = s.sim.time;
    const speed = Math.hypot(s.motion.velocity.x, s.motion.velocity.z);
    st.phase += speed * dt * STEPS_PER_METRE * Math.PI;
    const swing = Math.sin(st.phase) * STRIDE * Math.min(1, speed / runSpeed);
    legs.current.forEach((leg, i) => leg?.rotation.set(i === 0 ? swing : -swing, 0, 0));
    if (free.current) {
      // Held a little out from the side, for balance.
      const out = backhand ? -1 : 1;
      free.current.position.x = out * (SHOULDER_WIDTH + 0.02);
      free.current.rotation.set(swing, 0, out * FREE_ARM_OUT);
    }
  });

  return (
    <group ref={body}>
      {/* Legs, from the hips, with shoes. */}
      {[-0.1, 0.1].map((x, i) => (
        <group
          key={x}
          ref={(g) => {
            legs.current[i] = g;
          }}
          position={[x, HIP, 0]}
        >
          <Limb length={LEG} top={0.075} bottom={0.055} color={TROUSERS} />
          <mesh position={[0, -LEG + 0.01, 0.05]}>
            <boxGeometry args={[0.1, 0.08, 0.26]} />
            <meshStandardMaterial color={SHOES} />
          </mesh>
        </group>
      ))}
      {/* Hips and torso. */}
      <mesh position={[0, HIP, 0]}>
        <cylinderGeometry args={[0.18, 0.17, 0.16, 10]} />
        <meshStandardMaterial color={TROUSERS} flatShading />
      </mesh>
      <mesh position={[0, (HIP + shoulder) / 2 + 0.02, 0]} scale={[1, 1, 0.7]}>
        <cylinderGeometry args={[0.22, 0.17, shoulder - HIP + 0.1, 10]} />
        <meshStandardMaterial color={SHIRT} flatShading />
      </mesh>
      {/* Neck and head, with hair. */}
      <mesh position={[0, shoulder + 0.07, 0]}>
        <cylinderGeometry args={[0.05, 0.055, 0.12, 8]} />
        <meshStandardMaterial color={SKIN} flatShading />
      </mesh>
      <mesh position={[0, height - 0.13, 0]} scale={[0.9, 1.05, 1]}>
        <icosahedronGeometry args={[0.11, 1]} />
        <meshStandardMaterial color={SKIN} flatShading />
      </mesh>
      {/* Hair over the top and back of the head; the face is towards +z. */}
      <mesh position={[0, height - 0.12, -0.012]} rotation={[-0.6, 0, 0]} scale={[0.95, 1, 1]}>
        <sphereGeometry args={[0.112, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial color={HAIR} flatShading />
      </mesh>
      {/* The free arm, hanging from the other shoulder. */}
      <group ref={free} position={[SHOULDER_WIDTH, shoulder - 0.05, 0]}>
        <Limb length={0.32} top={0.05} bottom={0.042} color={SHIRT} />
        <group position={[0, -0.3, 0]} rotation={[-0.5, 0, 0]}>
          <Limb length={0.28} top={0.04} bottom={0.033} color={SKIN} />
        </group>
      </group>
      {/* Racket arm: the shoulder pivot; the arm points along +x before rotating. */}
      <group ref={arm} position={[-SHOULDER_WIDTH, SHOULDER_Y, 0]}>
        <group rotation={[0, 0, ARM.tilt]}>
          <mesh position={[0.13, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.042, 0.05, 0.26, 8]} />
            <meshStandardMaterial color={SHIRT} flatShading />
          </mesh>
          <mesh position={[0.38, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.032, 0.04, 0.24, 8]} />
            <meshStandardMaterial color={SKIN} flatShading />
          </mesh>
          {/* The racket, from the hand outwards. */}
          <group ref={wrist} position={[ARM.length, 0, 0]} rotation={[0, 0, ARM.wrist]}>
            <mesh position={[HANDLE_LENGTH / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.014, 0.016, HANDLE_LENGTH, 6]} />
              <meshStandardMaterial color="#7a5230" />
            </mesh>
            <mesh geometry={head} position={[HANDLE_LENGTH, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <meshStandardMaterial color="#d9c9a3" flatShading />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

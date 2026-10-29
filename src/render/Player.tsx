import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { ExtrudeGeometry, Shape, type Group } from "three";
import { timeSwing, FOLLOW_THROUGH } from "../game/practice.ts";
import { standardPlayer } from "../player/movement.ts";
import { SWING_TIME } from "../player/timing.ts";
import type { Store } from "./Practice.tsx";

const DEG = Math.PI / 180;
// Law 4: at most 680 mm overall.
const RACKET_LENGTH = 0.68;
const HEAD_LENGTH = 0.25;
const HANDLE_LENGTH = RACKET_LENGTH - HEAD_LENGTH;

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

export function Player({ store }: { store: Store }) {
  const body = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const head = useMemo(() => headGeometry(), []);
  const { height, radius } = standardPlayer;
  const shoulder = height - 0.35;

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
    arm.current.position.x = backhand ? radius : -radius;
    arm.current.rotation.y = backhand ? -angle * DEG : Math.PI + angle * DEG;
  });

  return (
    <group ref={body}>
      <mesh position={[0, (shoulder + 0.1) / 2, 0]}>
        <capsuleGeometry args={[radius * 0.8, shoulder - 0.3, 4, 12]} />
        <meshStandardMaterial color="#3a6ea5" flatShading />
      </mesh>
      <mesh position={[0, height - 0.12, 0]}>
        <icosahedronGeometry args={[0.12, 1]} />
        <meshStandardMaterial color="#e0b48c" flatShading />
      </mesh>
      {/* Shoulder pivot; the arm points along +x before rotating. */}
      <group ref={arm} position={[-radius, shoulder - 0.05, 0]}>
        <group rotation={[0, 0, -40 * DEG]}>
          <mesh position={[0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.035, 0.5, 6]} />
            <meshStandardMaterial color="#e0b48c" flatShading />
          </mesh>
          {/* The racket, from the hand outwards. */}
          <group position={[0.5, 0, 0]} rotation={[0, 0, 30 * DEG]}>
            <mesh position={[HANDLE_LENGTH / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.014, 0.016, HANDLE_LENGTH, 6]} />
              <meshStandardMaterial color="#7a5230" />
            </mesh>
            <mesh
              geometry={head}
              position={[HANDLE_LENGTH, 0, 0]}
              rotation={[0, 0, -Math.PI / 2]}
            >
              <meshStandardMaterial color="#d9c9a3" flatShading />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  LatheGeometry,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Group,
} from "three";
import { timeSwing, FOLLOW_THROUGH, type Athlete } from "../game/player.ts";
import { standardPlayer } from "../player/movement.ts";
import { SERVE_STYLES } from "../player/serve.ts";
import { SWING_TIME } from "../player/timing.ts";
import { ARM, groundstrokeArm, HANDLE_LENGTH, HEAD_LENGTH, serveArm } from "./serveArm.ts";

const DEG = Math.PI / 180;

/**
 * The lopsided real tennis racket head, in its own plane: y along the
 * racket, x across. The top bulges to one side.
 */
function headShape(): Shape {
  const s = new Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.075, 0.02, 0.095, 0.15, 0.065, HEAD_LENGTH);
  s.bezierCurveTo(0.03, HEAD_LENGTH + 0.015, -0.04, HEAD_LENGTH - 0.03, -0.06, 0.16);
  s.bezierCurveTo(-0.07, 0.08, -0.04, 0.02, 0, 0);
  return s;
}

/** The racket head: an open wooden frame round the outline, and its strings. */
function racketGeometry() {
  const s = headShape();
  const points = s.getPoints(16).map((p) => new Vector3(p.x, p.y, 0));
  points.pop(); // The outline closes on its start; the curve closes itself.
  const frame = new TubeGeometry(new CatmullRomCurve3(points, true), 80, 0.009, 6, true);
  const strings = new ShapeGeometry(s, 12);
  return { frame, strings };
}

/** Lathe a body part from (radius, height) pairs, squashed front to back. */
function lathe(profile: readonly (readonly [number, number])[]): LatheGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    20,
  );
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

/** A soft round shadow, drawn once and shared. */
let shadowTexture: CanvasTexture | null = null;
function blobShadow(): CanvasTexture {
  if (shadowTexture) return shadowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(0,0,0,0.55)");
  r.addColorStop(0.5, "rgba(0,0,0,0.3)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  shadowTexture = new CanvasTexture(c);
  return shadowTexture;
}

const SKIN = "#e0b48c";
/** Traditional whites, a touch off so the lighting still shows the shape. */
const SHIRT = "#eeede8";
const TROUSERS = "#e6e2d6";
const SHOES = "#f4f4f2";
const SOLES = "#3a3a3a";
const HAIR = "#4a3222";
const FRAME = "#b8854f";
const GRIP = "#5a3a22";
const STRINGS = "#f6f1e0";
const TRIM = "#2f64a8";

const HIP = 0.92;
/** The racket arm's pivot height. */
const SHOULDER_Y = standardPlayer.height - 0.38;
/** The top of the shirt, just above the arm pivots. */
const SHOULDER_TOP = SHOULDER_Y + 0.03;
const SHOULDER_WIDTH = 0.21;
const HIP_WIDTH = 0.095;
const THIGH = 0.44;
const SHIN = 0.43;
/** Height of the ankle joint off the floor. A little short of a straight leg, so the knees stay soft. */
const ANKLE = 0.07;
/** Height of the chest band's middle above the belt. */
const CHEST_BAND = 0.38;
const HEAD_Y = standardPlayer.height - 0.12;
/** The free arm. */
const UPPER_ARM = 0.28;
const FOREARM = 0.25;
/** How far the racket elbow sits below the line from shoulder to hand. */
const ELBOW_DROP = 0.04;
/** Steps per metre run, how far each foot travels, and how high it lifts. */
const STEPS_PER_METRE = 1.4;
const STRIDE = 0.3;
const LIFT = 0.12;
/** How far the free arm is held out from the side, and its swing when running. */
const FREE_ARM_OUT = 25 * DEG;
const ARM_SWING = 35 * DEG;

/**
 * Two-bone leg IK: the thigh's swing forwards and sideways from the hip and the
 * knee's bend, for a foot `forward` and `side` of the hip and `lift` off the floor.
 */
function legPose(forward: number, side: number, lift: number) {
  const h = HIP - ANKLE - lift;
  const out = Math.atan2(side, h);
  const down = Math.hypot(h, side);
  const d = Math.min(THIGH + SHIN - 1e-3, Math.hypot(down, forward));
  const thigh =
    Math.atan2(forward, down) + Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
  const knee = Math.PI - Math.acos((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN));
  return { thigh, knee, out };
}

/** Position, turn and length of a segment from `a` to `b`, for a y-aligned capsule. */
function between(a: Vector3, b: Vector3) {
  const d = b.clone().sub(a);
  return {
    position: a.clone().add(b).multiplyScalar(0.5),
    quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()),
    length: d.length(),
  };
}

/** A rounded limb segment hanging down from its pivot. */
function Limb({
  length,
  radius,
  material,
}: {
  length: number;
  radius: number;
  material: MeshStandardMaterial;
}) {
  return (
    <mesh position={[0, -length / 2, 0]} material={material}>
      <capsuleGeometry args={[radius, length, 4, 10]} />
    </mesh>
  );
}

/** A short sleeve with a coloured band at the hem, round a limb hanging down from its pivot. */
function Sleeve({ shirt, trim }: { shirt: MeshStandardMaterial; trim: MeshStandardMaterial }) {
  return (
    <>
      <mesh position={[0, -0.06, 0]} material={shirt}>
        <cylinderGeometry args={[0.058, 0.056, 0.12, 12]} />
      </mesh>
      <mesh position={[0, -0.125, 0]} material={trim}>
        <cylinderGeometry args={[0.057, 0.057, 0.022, 12]} />
      </mesh>
    </>
  );
}

/** What the figure is drawn from, read every frame. */
export type PlayerView = () => { readonly athlete: Athlete; readonly time: number };

export function Player({ view, trim = TRIM }: { view: PlayerView; trim?: string }) {
  const body = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const free = useRef<Group>(null);
  const freeElbow = useRef<Group>(null);
  const wrist = useRef<Group>(null);
  const thighs = useRef<(Group | null)[]>([]);
  const knees = useRef<(Group | null)[]>([]);
  const ankles = useRef<(Group | null)[]>([]);
  const stride = useRef({ phase: 0, last: 0 });
  const { runSpeed } = standardPlayer;

  const m = useMemo(() => {
    const mat = (color: string, roughness = 0.8) => new MeshStandardMaterial({ color, roughness });
    return {
      skin: mat(SKIN, 0.7),
      shirt: mat(SHIRT),
      trousers: mat(TROUSERS),
      shoes: mat(SHOES, 0.6),
      soles: mat(SOLES),
      hair: mat(HAIR, 0.9),
      trim: mat(trim, 0.6),
      frame: mat(FRAME, 0.5),
      grip: mat(GRIP),
      strings: new MeshStandardMaterial({
        color: STRINGS,
        transparent: true,
        opacity: 0.35,
        side: DoubleSide,
        depthWrite: false,
      }),
    };
  }, [trim]);

  const g = useMemo(() => {
    const top = SHOULDER_TOP - HIP;
    return {
      ...racketGeometry(),
      // Chest and shoulders, from the belt up to the neck.
      shirt: lathe([
        [0.15, 0.02],
        [0.147, 0.12],
        [0.143, 0.2],
        [0.165, 0.32],
        [0.18, 0.42],
        [0.172, top - 0.03],
        [0.13, top + 0.02],
        [0.07, top + 0.045],
        [0, top + 0.05],
      ]),
      // Hips, down to where the legs start.
      pelvis: lathe([
        [0, -0.12],
        [0.06, -0.115],
        [0.12, -0.08],
        [0.158, -0.02],
        [0.157, 0.07],
      ]),
      // The racket arm, bowed a little at the elbow; the hand stays at ARM.length.
      upper: between(new Vector3(0, 0, 0), new Vector3(ARM.length / 2, -ELBOW_DROP, 0)),
      fore: between(new Vector3(ARM.length / 2, -ELBOW_DROP, 0), new Vector3(ARM.length, 0, 0)),
    };
  }, []);

  useFrame(() => {
    const { athlete: s, time } = view();
    if (!body.current || !arm.current) return;
    body.current.position.set(s.motion.position.x, 0, s.motion.position.z);
    const facing = s.end === "service" ? 1 : -1;
    body.current.rotation.y = facing === 1 ? 0 : Math.PI;
    let angle = -20;
    let backhand = false;
    if (s.swing) {
      angle = armAngle(time - s.swing.start);
      backhand = s.swing.contact ? s.swing.backhand : (timeSwing(s, s.swing)?.backhand ?? false);
    }
    // Facing +z the right is -x. The arm points along its local +x; turn it
    // so 0° is straight out to the side and positive angles come forwards.
    arm.current.position.x = backhand ? SHOULDER_WIDTH : -SHOULDER_WIDTH;
    if (s.swing?.serve) {
      const style = SERVE_STYLES[s.serveStyle]!;
      const pivot = new Vector3(-SHOULDER_WIDTH, SHOULDER_Y, 0);
      const idle = groundstrokeArm(-20, false);
      const t = time - s.swing.start;
      const pose = serveArm(t, style.overarm, style.contactHeight, pivot, idle);
      arm.current.quaternion.copy(pose.arm);
      wrist.current?.rotation.set(0, 0, pose.wrist);
    } else {
      arm.current.quaternion.copy(groundstrokeArm(angle, backhand));
      wrist.current?.rotation.set(0, 0, ARM.wrist);
    }

    // The feet step along the direction of travel, in the body's own frame.
    const st = stride.current;
    const dt = Math.max(0, Math.min(0.1, time - st.last));
    st.last = time;
    const { x: vx, z: vz } = s.motion.velocity;
    const speed = Math.hypot(vx, vz);
    st.phase += speed * dt * STEPS_PER_METRE * Math.PI;
    const run = Math.min(1, speed / runSpeed);
    const dx = speed > 1e-3 ? (vx / speed) * facing : 0;
    const dz = speed > 1e-3 ? (vz / speed) * facing : 0;
    for (let i = 0; i < 2; i++) {
      const phase = st.phase + i * Math.PI;
      const step = Math.sin(phase) * STRIDE * run;
      const lift = Math.max(0, Math.cos(phase)) * LIFT * run;
      // Feet a little wider than the hips, for a ready stance.
      const side = (i === 0 ? -1 : 1) * 0.04 + dx * step;
      const leg = legPose(dz * step, side, lift);
      thighs.current[i]?.rotation.set(-leg.thigh, 0, leg.out, "ZXY");
      knees.current[i]?.rotation.set(leg.knee, 0, 0);
      ankles.current[i]?.rotation.set(leg.thigh - leg.knee, 0, 0);
    }
    if (free.current && freeElbow.current) {
      // Held a little out from the side for balance, swinging against the legs.
      const out = backhand ? -1 : 1;
      free.current.position.x = out * SHOULDER_WIDTH;
      free.current.rotation.set(Math.sin(st.phase) * ARM_SWING * run, 0, out * FREE_ARM_OUT, "ZXY");
      freeElbow.current.rotation.set(-0.35 - 0.9 * run, 0, 0);
    }
  });

  return (
    <group ref={body}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} renderOrder={1}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshBasicMaterial map={blobShadow()} transparent depthWrite={false} />
      </mesh>
      {/* Legs, from the hips: thigh, knee, shin and shoe. */}
      {[-HIP_WIDTH, HIP_WIDTH].map((x, i) => (
        <group
          key={x}
          ref={(gr) => {
            thighs.current[i] = gr;
          }}
          position={[x, HIP, 0]}
        >
          <Limb length={THIGH} radius={0.066} material={m.trousers} />
          <group
            ref={(gr) => {
              knees.current[i] = gr;
            }}
            position={[0, -THIGH, 0]}
          >
            <Limb length={SHIN} radius={0.057} material={m.trousers} />
            <group
              ref={(gr) => {
                ankles.current[i] = gr;
              }}
              position={[0, -SHIN, 0]}
            >
              <mesh
                position={[0, -0.025, 0.05]}
                rotation={[Math.PI / 2, 0, 0]}
                scale={[1.1, 1, 0.75]}
                material={m.shoes}
              >
                <capsuleGeometry args={[0.048, 0.17, 4, 10]} />
              </mesh>
              <mesh position={[0, -ANKLE + 0.008, 0.05]} material={m.soles}>
                <boxGeometry args={[0.1, 0.016, 0.27]} />
              </mesh>
            </group>
          </group>
        </group>
      ))}
      {/* Hips, belt and shirt. */}
      <mesh geometry={g.pelvis} position={[0, HIP, 0]} scale={[1, 1, 0.68]} material={m.trousers} />
      <mesh position={[0, HIP + 0.07, 0]} scale={[1, 1, 0.68]} material={m.trim}>
        <cylinderGeometry args={[0.156, 0.156, 0.045, 20]} />
      </mesh>
      <mesh
        geometry={g.shirt}
        position={[0, HIP + 0.07, 0]}
        scale={[1, 1, 0.64]}
        material={m.shirt}
      />
      {/* A band round the chest, so the players can be told apart from a distance. */}
      <mesh position={[0, HIP + 0.07 + CHEST_BAND, 0]} scale={[1, 1, 0.64]} material={m.trim}>
        <cylinderGeometry args={[0.184, 0.177, 0.07, 20]} />
      </mesh>
      {/* Collar, neck and head, with hair, ears and a nose; the face is towards +z. */}
      <mesh
        position={[0, SHOULDER_TOP + 0.1, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1, 0.8, 1]}
        material={m.trim}
      >
        <torusGeometry args={[0.058, 0.016, 8, 20]} />
      </mesh>
      <mesh position={[0, SHOULDER_TOP + 0.14, 0]} material={m.skin}>
        <cylinderGeometry args={[0.048, 0.052, 0.14, 12]} />
      </mesh>
      <group position={[0, HEAD_Y, 0]}>
        <mesh scale={[0.88, 1.05, 0.98]} material={m.skin}>
          <sphereGeometry args={[0.1, 20, 16]} />
        </mesh>
        <mesh
          position={[0, 0.012, -0.008]}
          rotation={[-0.55, 0, 0]}
          scale={[0.93, 1.05, 1]}
          material={m.hair}
        >
          <sphereGeometry args={[0.106, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.087, -0.005, -0.005]}
            scale={[0.5, 1, 0.75]}
            material={m.skin}
          >
            <sphereGeometry args={[0.025, 10, 8]} />
          </mesh>
        ))}
        <mesh position={[0, -0.012, 0.096]} scale={[0.8, 1.2, 1]} material={m.skin}>
          <sphereGeometry args={[0.018, 10, 8]} />
        </mesh>
      </group>
      {/* The free arm, hanging from the other shoulder. */}
      <group ref={free} position={[SHOULDER_WIDTH, SHOULDER_Y, 0]}>
        <mesh position={[0, -0.01, 0]} material={m.shirt}>
          <sphereGeometry args={[0.058, 14, 10]} />
        </mesh>
        <Sleeve shirt={m.shirt} trim={m.trim} />
        <Limb length={UPPER_ARM} radius={0.042} material={m.skin} />
        <group ref={freeElbow} position={[0, -UPPER_ARM, 0]}>
          <Limb length={FOREARM} radius={0.035} material={m.skin} />
          <mesh position={[0, -FOREARM - 0.04, 0]} scale={[0.8, 1.2, 1]} material={m.skin}>
            <sphereGeometry args={[0.04, 12, 10]} />
          </mesh>
        </group>
      </group>
      {/* Racket arm: the shoulder pivot; the arm points along +x before rotating. */}
      <group ref={arm} position={[-SHOULDER_WIDTH, SHOULDER_Y, 0]}>
        <mesh position={[0, -0.01, 0]} material={m.shirt}>
          <sphereGeometry args={[0.058, 14, 10]} />
        </mesh>
        <group rotation={[0, 0, ARM.tilt]}>
          <group quaternion={g.upper.quaternion}>
            <group rotation={[0, 0, Math.PI]}>
              <Sleeve shirt={m.shirt} trim={m.trim} />
            </group>
          </group>
          <mesh position={g.upper.position} quaternion={g.upper.quaternion} material={m.skin}>
            <capsuleGeometry args={[0.042, g.upper.length, 4, 10]} />
          </mesh>
          <mesh position={g.fore.position} quaternion={g.fore.quaternion} material={m.skin}>
            <capsuleGeometry args={[0.035, g.fore.length, 4, 10]} />
          </mesh>
          {/* The racket, from the hand outwards. */}
          <group ref={wrist} position={[ARM.length, 0, 0]} rotation={[0, 0, ARM.wrist]}>
            <mesh position={[0.02, 0, 0]} scale={[1.2, 0.9, 1]} material={m.skin}>
              <sphereGeometry args={[0.042, 12, 10]} />
            </mesh>
            <mesh
              position={[HANDLE_LENGTH / 2, 0, 0]}
              rotation={[0, 0, Math.PI / 2]}
              material={m.grip}
            >
              <cylinderGeometry args={[0.013, 0.017, HANDLE_LENGTH, 8]} />
            </mesh>
            <group position={[HANDLE_LENGTH, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <mesh geometry={g.frame} material={m.frame} />
              <mesh geometry={g.strings} material={m.strings} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

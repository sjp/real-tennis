import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { button, folder, useControls } from "leva";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import { standardCourt as court } from "../court/standard.ts";
import { standardBall } from "../sim/ball.ts";
import type { SimEvent } from "../sim/events.ts";
import type { Vec3 } from "../sim/vec.ts";
import {
  createWorld,
  initialState,
  predict,
  standardMaterials,
  step,
  STEP,
  type Prediction,
  type SimState,
  type World,
} from "../sim/world.ts";
import { Court } from "./Court.tsx";

const hw = court.floor.width / 2;

type Triple = [number, number, number];
interface Launch {
  readonly position: Triple;
  readonly velocity: Triple;
  readonly spin: Triple;
}

/** Starting shots for tuning. Travelling +z, spin about -x is backspin. */
const PRESETS: Record<string, Launch> = {
  "Side penthouse serve": {
    position: [hw - 1.5, 1.8, -4],
    velocity: [5, 5.5, 5.5],
    spin: [0, 0, 0],
  },
  "Backspin drop": { position: [0, 1, -6], velocity: [0, 2, 12], spin: [-150, 0, 0] },
  "Into the dedans": { position: [0, 1.5, 8], velocity: [0, 3, -22], spin: [0, 0, 0] },
  "Nick on the Main Wall": { position: [-hw + 2, 1.2, 4], velocity: [-8, -4, 0], spin: [0, 0, 0] },
};

const EVENT_COLOUR: Record<SimEvent["type"], string> = {
  racketHit: "#ffffff",
  floorBounce: "#ffd166",
  wallHit: "#4cc9f0",
  penthouseHit: "#80ed99",
  tambourHit: "#b388eb",
  netHit: "#ff8fa3",
  nick: "#ff5d5d",
  netCrossed: "#6c757d",
  enteredOpening: "#06d6a0",
  outOfCourt: "#ff5d5d",
  playerHit: "#ff9f1c",
  restOnFloor: "#adb5bd",
};

interface Shot {
  readonly world: World;
  readonly start: SimState;
  readonly prediction: Prediction;
}

/** Reads a leva control by its path, e.g. "Ball.drag". */
type Get = (path: string) => number;

/** Builds a world from the sliders and fires `launch`, or the Launch sliders. */
function makeShot(get: Get, launch?: Launch): Shot {
  const world = createWorld(
    court,
    { ...standardBall, dragCoefficient: get("Ball.drag"), spinDecay: get("Ball.spinDecay") },
    {
      ...standardMaterials,
      floor: { restitution: get("Surfaces.floorCor"), friction: get("Surfaces.floorMu") },
      wall: { restitution: get("Surfaces.wallCor"), friction: get("Surfaces.wallMu") },
      roof: { restitution: get("Surfaces.roofCor"), friction: get("Surfaces.roofMu") },
    },
  );
  const read = (k: keyof Launch, prefix: string): Vec3 => {
    const [x, y, z] = launch?.[k] ?? ["x", "y", "z"].map((a) => get(`Launch.${prefix}${a}`));
    return { x: x!, y: y!, z: z! };
  };
  const start = initialState({
    position: read("position", "p"),
    velocity: read("velocity", "v"),
    spin: read("spin", "w"),
  });
  return { world, start, prediction: predict(world, start, 8) };
}

function useSandboxControls(onShot: (shot: Shot) => void) {
  const [preset, setPreset] = useState<Launch>();
  const first = PRESETS["Side penthouse serve"]!;
  const [values, set] = useControls(() => ({
    Launch: folder({
      px: { value: first.position[0], step: 0.1 },
      py: { value: first.position[1], min: 0.05, max: 9, step: 0.1 },
      pz: { value: first.position[2], step: 0.1 },
      vx: { value: first.velocity[0], step: 0.5 },
      vy: { value: first.velocity[1], step: 0.5 },
      vz: { value: first.velocity[2], step: 0.5 },
      wx: { value: first.spin[0], step: 10, label: "spin x" },
      wy: { value: first.spin[1], step: 10, label: "spin y" },
      wz: { value: first.spin[2], step: 10, label: "spin z" },
      Fire: button((get) => {
        onShot(makeShot(get));
      }),
    }),
    Presets: folder(
      Object.fromEntries(
        Object.entries(PRESETS).map(([name, l]) => [
          name,
          button((get) => {
            setPreset(l);
            onShot(makeShot(get, l));
          }),
        ]),
      ),
    ),
    Ball: folder({
      drag: { value: standardBall.dragCoefficient, min: 0, max: 1, step: 0.01 },
      spinDecay: { value: standardBall.spinDecay, min: 0, max: 0.5, step: 0.01 },
    }),
    Surfaces: folder({
      floorCor: { value: standardMaterials.floor.restitution, min: 0, max: 1, step: 0.01 },
      floorMu: { value: standardMaterials.floor.friction, min: 0, max: 1.5, step: 0.01 },
      wallCor: { value: standardMaterials.wall.restitution, min: 0, max: 1, step: 0.01 },
      wallMu: { value: standardMaterials.wall.friction, min: 0, max: 1.5, step: 0.01 },
      roofCor: { value: standardMaterials.roof.restitution, min: 0, max: 1, step: 0.01 },
      roofMu: { value: standardMaterials.roof.friction, min: 0, max: 1.5, step: 0.01 },
    }),
    View: folder({ timeScale: { value: 1, min: 0.05, max: 2, step: 0.05 } }),
  }));

  // Show the chosen preset on the Launch sliders.
  useEffect(() => {
    if (!preset) return;
    const [px, py, pz] = preset.position;
    const [vx, vy, vz] = preset.velocity;
    const [wx, wy, wz] = preset.spin;
    set({ px, py, pz, vx, vy, vz, wx, wy, wz });
  }, [preset, set]);
  return values;
}

function SimBall({
  world,
  start,
  timeScale,
}: {
  world: World;
  start: SimState;
  timeScale: number;
}) {
  const mesh = useRef<Mesh>(null);
  const sim = useRef({ prev: start, cur: start, acc: 0 });
  useEffect(() => {
    sim.current = { prev: start, cur: start, acc: 0 };
  }, [start]);
  useFrame((_, delta) => {
    const s = sim.current;
    s.acc += Math.min(delta, 0.1) * timeScale;
    while (s.acc >= STEP) {
      s.prev = s.cur;
      s.cur = step(world, s.cur).state;
      s.acc -= STEP;
    }
    const a = s.prev.ball.position;
    const b = s.cur.ball.position;
    const t = s.acc / STEP;
    mesh.current?.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  });
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[world.ball.radius, 16, 12]} />
      <meshStandardMaterial color="#f5f0e1" />
    </mesh>
  );
}

function EventLog({ events }: { events: readonly SimEvent[] }) {
  return (
    <ol
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        margin: 0,
        padding: "8px 8px 8px 28px",
        maxHeight: "40vh",
        overflowY: "auto",
        font: "12px/1.5 ui-monospace, monospace",
        color: "#e8e8e8",
        background: "rgba(0, 0, 0, 0.6)",
        borderRadius: 6,
      }}
    >
      {events.map((e, i) => (
        <li key={i} style={{ color: EVENT_COLOUR[e.type] }}>
          {e.time.toFixed(3)}s {e.type} · {e.surface}
          {"bounce" in e ? ` #${String(e.bounce)}` : ""}
          {"edge" in e && e.edge ? " (edge)" : ""}
          {"face" in e ? ` (${e.face} face${e.cord ? ", cord" : ""})` : ""}
        </li>
      ))}
    </ol>
  );
}

/** Fire balls with chosen velocity and spin, and tune the physics (`?sandbox`). */
export function Sandbox() {
  const [shot, setShot] = useState<Shot>();
  const v = useSandboxControls(setShot);

  const trail = useMemo(
    () => shot?.prediction.path.map((p) => [p.x, p.y, p.z] as Triple) ?? [],
    [shot],
  );

  return (
    <>
      <Canvas camera={{ position: [-3, 7, -20], fov: 50 }}>
        <color attach="background" args={["#101418"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 12, -6]} intensity={1.8} />
        <directionalLight position={[-6, 8, 10]} intensity={0.6} />
        <Court court={court} />
        {shot && (
          <>
            <SimBall world={shot.world} start={shot.start} timeScale={v.timeScale} />
            {trail.length > 1 && (
              <Line points={trail} color="#f5f0e1" lineWidth={1} transparent opacity={0.5} />
            )}
            {shot.prediction.events.map((e, i) => (
              <mesh key={i} position={[e.position.x, e.position.y, e.position.z]}>
                <sphereGeometry args={[0.06, 12, 8]} />
                <meshBasicMaterial color={EVENT_COLOUR[e.type]} />
              </mesh>
            ))}
          </>
        )}
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
      <EventLog events={shot?.prediction.events ?? []} />
    </>
  );
}

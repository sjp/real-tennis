import { useFrame, useThree, Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3, type Mesh } from "three";
import { standardCourt as court } from "../court/standard.ts";
import { assist, type Assist } from "../game/assist.ts";
import {
  changeEnds,
  feedDrop,
  feedMachine,
  initialPractice,
  practiceStep,
  startServe,
  type Notice,
  type PracticeState,
} from "../game/practice.ts";
import { keyboard } from "../input/keyboard.ts";
import { forwardZ } from "../player/movement.ts";
import { secondGalleryLineZ, SERVE_STYLES } from "../player/serve.ts";
import type { SimEvent } from "../sim/events.ts";
import { createWorld, predict, STEP, type Prediction } from "../sim/world.ts";
import { Court } from "./Court.tsx";
import { Player } from "./Player.tsx";

const world = createWorld(court);
const hw = court.floor.width / 2;
const hl = court.floor.length / 2;

/** Camera placement behind the player. ⚠ verify in play. */
const BEHIND = 5;
const ABOVE = 3.8;
const LOOK_AHEAD = 8;
/** Seconds for the camera to settle; about 1 s to swing round on a change of ends. */
const FOLLOW = 0.15;
const TURN = 0.3;
/** Seconds of ball flight the hit assist looks ahead. */
const ASSIST_HORIZON = 3;

/** The game state, owned outside React and stepped every frame. */
export interface Store {
  get(): PracticeState;
  set(s: PracticeState): void;
}

function createStore(): Store {
  let state = initialPractice(world);
  return {
    get: () => state,
    set: (s) => {
      state = s;
    },
  };
}

/** The current shot or serve style, for the HUD. */
function choice(s: PracticeState): string {
  return s.serve !== null ? `Serve: ${SERVE_STYLES[s.serveStyle]!.name}` : `Shot: ${s.shot}`;
}

interface Hud {
  readonly choice: string;
  readonly last: string | null;
  readonly fault: string | null;
  readonly event: string | null;
  readonly assist: boolean;
}

function describeNotice(n: Notice): Partial<Hud> {
  switch (n.type) {
    case "whiff":
      return { last: "Missed it", fault: null };
    case "serverFault":
      return {
        fault:
          n.reason === "line"
            ? "Fault: on or over the Second Gallery line (Law 8.1(d)(i))"
            : "Fault: missed the ball (Law 8.1(d)(ii))",
      };
    case "shot": {
      const ms = Math.round(Math.abs(n.timing.error) * 1000);
      const when =
        n.timing.grade === "perfect" ? "" : ` · ${n.timing.error > 0 ? "early" : "late"} ${ms} ms`;
      return { last: `${n.shot}: ${n.timing.grade}${when}`, fault: null, event: null };
    }
  }
}

function describeEvent(e: SimEvent): string | null {
  switch (e.type) {
    case "enteredOpening":
      return `Into ${court.openings.find((o) => o.id === e.opening)!.name}`;
    case "outOfCourt":
      return "Out of court";
    case "playerHit":
      return "The ball hit you";
    case "netHit":
      return e.cord ? "Off the net cord" : "Into the net";
    default:
      return null;
  }
}

/** Steps the game at a fixed rate, and draws the ball between steps. */
function Loop({
  store,
  assistOn,
  onHud,
}: {
  store: Store;
  assistOn: boolean;
  onHud: (h: Partial<Hud>) => void;
}) {
  const ball = useRef<Mesh>(null);
  const bounceRing = useRef<Mesh>(null);
  const interceptRing = useRef<Mesh>(null);
  const keys = useMemo(() => keyboard(), []);
  const loop = useRef({ prev: store.get().sim.ball.position, acc: 0 });
  const plan = useRef<{ prediction: Prediction | null; at: number }>({ prediction: null, at: -1 });
  const camera = useThree((s) => s.camera);
  const look = useRef(new Vector3(0, 1, 0));
  const yaw = useRef(0);

  useEffect(() => () => keys.dispose(), [keys]);

  useFrame((_, delta) => {
    const l = loop.current;
    let input = keys.read();
    l.acc += Math.min(delta, 0.1);
    let changed = false;
    while (l.acc >= STEP) {
      const before = store.get();
      l.prev = before.sim.ball.position;
      const r = practiceStep(world, before, input);
      store.set(r.state);
      input = { ...input, swing: false, select: null };
      l.acc -= STEP;
      if (
        r.events.length > 0 ||
        before.shot !== r.state.shot ||
        before.serveStyle !== r.state.serveStyle
      )
        changed = true;
      for (const n of r.notices) onHud(describeNotice(n));
      for (const e of r.events) {
        const text = describeEvent(e);
        if (text) onHud({ event: text });
      }
    }
    const s = store.get();

    // The ball, between the last two steps.
    const a = l.prev;
    const b = s.sim.ball.position;
    const t = l.acc / STEP;
    ball.current?.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

    // Hit assist: re-predict after anything happens, and a few times a second.
    const p = plan.current;
    if (changed || s.sim.time - p.at > 0.25 || s.sim.time < p.at) {
      p.prediction = s.sim.asleep ? null : predict(world, s.sim, ASSIST_HORIZON);
      p.at = s.sim.time;
    }
    const rings: Assist = p.prediction
      ? assist(p.prediction, s.motion, s.end, s.sim.time)
      : { bounce: null, intercept: null };
    for (const [mesh, at] of [
      [bounceRing.current, rings.bounce],
      [interceptRing.current, rings.intercept],
    ] as const) {
      if (!mesh) continue;
      mesh.visible = assistOn && at !== null;
      if (at) mesh.position.set(at.x, 0.01, at.z);
    }

    // Camera: behind and above, looking down the court, kept inside the walls.
    const target = s.end === "service" ? 0 : Math.PI;
    let turn = target - yaw.current;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    yaw.current += turn * Math.min(1, delta / TURN);
    const fx = Math.sin(yaw.current);
    const fz = Math.cos(yaw.current);
    const { x, z } = s.motion.position;
    let cz = z - fz * BEHIND;
    const over = Math.max(0, Math.abs(cz) - (hl - 0.3));
    cz = Math.sign(cz) * Math.min(Math.abs(cz), hl - 0.3);
    const cx = Math.max(-hw + 0.3, Math.min(hw - 0.3, x - fx * BEHIND));
    const k = Math.min(1, delta / FOLLOW);
    camera.position.lerp(new Vector3(cx, ABOVE + over * 0.8, cz), k);
    look.current.lerp(new Vector3(x + fx * LOOK_AHEAD, 0.5, z + fz * LOOK_AHEAD), k);
    camera.lookAt(look.current);
  });

  return (
    <>
      <mesh ref={ball}>
        <sphereGeometry args={[world.ball.radius, 16, 12]} />
        <meshStandardMaterial color="#f5f0e1" />
      </mesh>
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
function ServeLine({ store }: { store: Store }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    if (mesh.current) mesh.current.visible = store.get().serve !== null;
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

const HELP = [
  "WASD / arrows: move · Shift: sprint · Space: swing",
  "1 drive · 2 cut · 3 lob · 4 boast (serving: 1–8 serve style)",
  "R: drop feed · F: machine feed · Q: serve · E: change ends · H: hit assist",
];

const panel = {
  position: "absolute",
  margin: 0,
  padding: "8px 12px",
  font: "13px/1.5 ui-monospace, monospace",
  color: "#e8e8e8",
  background: "rgba(0, 0, 0, 0.6)",
  borderRadius: 6,
} as const;

/** Solo practice: move, hit, and serve, with no opponent. */
export function Practice() {
  const [store] = useState(createStore);
  const [hud, setHud] = useState<Hud>(() => ({
    choice: choice(store.get()),
    last: null,
    fault: null,
    event: null,
    assist: true,
  }));
  const onHud = (h: Partial<Hud>) => setHud((old) => ({ ...old, ...h }));

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const s = store.get();
      const command: Record<string, () => PracticeState> = {
        KeyR: () => feedDrop(s),
        KeyF: () => feedMachine(world, s, Math.random),
        KeyE: () => changeEnds(court, s),
        KeyQ: () => startServe(court, s),
      };
      if (e.code === "KeyH") setHud((h) => ({ ...h, assist: !h.assist }));
      const run = command[e.code];
      if (!run) return;
      store.set(run());
      setHud((h) => ({ ...h, choice: choice(store.get()), fault: null, event: null }));
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [store]);

  const start = store.get().motion.position;
  const f = forwardZ(store.get().end);

  return (
    <>
      <Canvas camera={{ position: [start.x, ABOVE, start.z - f * BEHIND], fov: 55 }}>
        <color attach="background" args={["#101418"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 12, -6]} intensity={1.8} />
        <directionalLight position={[-6, 8, 10]} intensity={0.6} />
        <Court court={court} />
        <ServeLine store={store} />
        <Player store={store} />
        <Loop store={store} assistOn={hud.assist} onHud={onHud} />
      </Canvas>
      <div style={{ ...panel, left: 12, top: 12 }}>
        <div>{hud.choice}</div>
        {hud.last && <div>{hud.last}</div>}
        {hud.event && <div style={{ color: "#4cc9f0" }}>{hud.event}</div>}
        {hud.fault && <div style={{ color: "#ff5d5d" }}>{hud.fault}</div>}
      </div>
      <div style={{ ...panel, left: 12, bottom: 12, fontSize: 12, color: "#b8b8b8" }}>
        {HELP.map((h) => (
          <div key={h}>{h}</div>
        ))}
        <div>Hit assist: {hud.assist ? "on" : "off"}</div>
      </div>
    </>
  );
}

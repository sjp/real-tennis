import { useFrame, Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import { standardCourt as court } from "../court/standard.ts";
import {
  changeEnds,
  feedDrop,
  feedMachine,
  initialPractice,
  practiceStep,
  startServe,
  type PracticeState,
} from "../game/practice.ts";
import { keyboard } from "../input/keyboard.ts";
import { SERVE_STYLES } from "../player/serve.ts";
import { createWorld, STEP } from "../sim/world.ts";
import { EXPLANATIONS } from "../teach/content.ts";
import { dismiss, toggle } from "../teach/explain.ts";
import {
  createExplainStore,
  explainCalls,
  focusOf,
  useExplainer,
  type ExplainStore,
} from "./explainStore.ts";
import { Markings } from "./markings.tsx";
import { ExplainPanel, Highlight } from "./teach.tsx";
import { Court } from "./Court.tsx";
import { AssistRings, FollowCamera, ServeLine } from "./scene.tsx";
import { cameraStart, describeEvent, describeNotice, panel } from "./view.ts";
import { Player } from "./Player.tsx";

const world = createWorld(court);

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

type HudChange = Partial<Hud> | ((old: Hud) => Partial<Hud>);

interface Hud {
  readonly choice: string;
  readonly last: string | null;
  /** The Marker's calls for the current rest. */
  readonly calls: readonly string[];
  readonly event: string | null;
  readonly assist: boolean;
  readonly markings: boolean;
}

/** Steps the game at a fixed rate, and draws the ball between steps. */
function Loop({
  store,
  explain,
  onHud,
}: {
  store: Store;
  explain: ExplainStore;
  onHud: (h: HudChange) => void;
}) {
  const ball = useRef<Mesh>(null);
  const keys = useMemo(() => keyboard(), []);
  const loop = useRef({ prev: store.get().sim.ball.position, acc: 0, paused: false });

  useEffect(() => () => keys.dispose(), [keys]);

  useFrame((_, delta) => {
    const l = loop.current;
    let input = keys.read();
    // Frozen while the Marker explains; the key that resumes isn't a swing.
    const paused = explain.get().showing !== null;
    if (paused || l.paused) {
      l.paused = paused;
      l.acc = 0;
      return;
    }
    l.acc += Math.min(delta, 0.1);
    while (l.acc >= STEP && explain.get().showing === null) {
      const before = store.get();
      l.prev = before.sim.ball.position;
      const r = practiceStep(world, before, input);
      store.set(r.state);
      input = { ...input, swing: false, select: null };
      l.acc -= STEP;
      if (before.shot !== r.state.shot || before.serveStyle !== r.state.serveStyle)
        onHud({ choice: choice(r.state) });
      for (const n of r.notices) onHud(describeNotice(n));
      const rally = r.state.rally;
      explainCalls(explain, r.calls, !rally || rally.outcome !== null || rally.striker === null);
      if (r.calls.length > 0)
        onHud((h) => ({
          calls: [...h.calls, ...r.calls.map((c) => `${c.message} (Law ${c.law})`)].slice(-3),
        }));
      for (const e of r.events) {
        const text = describeEvent(e);
        if (text) onHud({ event: text });
      }
    }
    // The ball, between the last two steps.
    const a = l.prev;
    const b = store.get().sim.ball.position;
    const t = l.acc / STEP;
    ball.current?.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  });

  return (
    <mesh ref={ball}>
      <sphereGeometry args={[world.ball.radius, 16, 12]} />
      <meshStandardMaterial color="#f5f0e1" />
    </mesh>
  );
}

const HELP = [
  "WASD / arrows: move · Shift: sprint · Space: swing",
  "1 drive · 2 cut · 3 lob · 4 boast (serving: 1–8 serve style)",
  "R: drop feed · F: machine feed · Q: serve · E: change ends · H: hit assist",
  "M: court markings · X: explanations on/off",
];

/** Solo practice: move, hit, and serve, with no opponent. */
export function Practice() {
  const [store] = useState(createStore);
  const [explain] = useState(createExplainStore);
  const ex = useExplainer(explain);
  const feature = ex.showing && EXPLANATIONS[ex.showing].feature;
  const [hud, setHud] = useState<Hud>(() => ({
    choice: choice(store.get()),
    last: null,
    calls: [],
    event: null,
    assist: true,
    markings: false,
  }));
  const onHud = (h: HudChange) =>
    setHud((old) => ({ ...old, ...(typeof h === "function" ? h(old) : h) }));

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const s = store.get();
      const command: Record<string, () => PracticeState> = {
        KeyR: () => feedDrop(court, s),
        KeyF: () => feedMachine(world, s, Math.random),
        KeyE: () => changeEnds(court, s),
        KeyQ: () => startServe(court, s),
      };
      if (e.code === "KeyH") setHud((h) => ({ ...h, assist: !h.assist }));
      if (e.code === "KeyX") explain.set(toggle(explain.get()));
      if (e.code === "KeyM") setHud((h) => ({ ...h, markings: !h.markings }));
      // No feeds while the Marker explains.
      if (explain.get().showing) return;
      const run = command[e.code];
      if (!run) return;
      store.set(run());
      setHud((h) => ({ ...h, choice: choice(store.get()), calls: [], event: null }));
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [store, explain]);

  const s = store.get();

  return (
    <>
      <Canvas camera={{ position: cameraStart(s.motion.position, s.end), fov: 55 }}>
        <color attach="background" args={["#101418"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 12, -6]} intensity={1.8} />
        <directionalLight position={[-6, 8, 10]} intensity={0.6} />
        <Court court={court} />
        <ServeLine visible={() => store.get().serve !== null} />
        <Player view={() => ({ athlete: store.get(), time: store.get().sim.time })} />
        <Loop store={store} explain={explain} onHud={onHud} />
        {feature && <Highlight feature={feature} />}
        {hud.markings && <Markings />}
        <AssistRings view={() => store.get()} on={hud.assist} />
        <FollowCamera
          target={() => {
            const s = store.get();
            return {
              at: s.motion.position,
              end: s.end,
              ball: s.sim.live ? s.sim.ball.position : null,
              focus: focusOf(explain),
            };
          }}
        />
      </Canvas>
      <div style={{ ...panel, left: 12, top: 12 }}>
        <div>{hud.choice}</div>
        {hud.last && <div>{hud.last}</div>}
        {hud.event && <div style={{ color: "#4cc9f0" }}>{hud.event}</div>}
        {hud.calls.map((c, i) => (
          <div key={i} style={{ color: "#ffd166" }}>
            {c}
          </div>
        ))}
      </div>
      <div style={{ ...panel, left: 12, bottom: 12, fontSize: 12, color: "#b8b8b8" }}>
        {HELP.map((h) => (
          <div key={h}>{h}</div>
        ))}
        <div>
          Hit assist: {hud.assist ? "on" : "off"} · Explanations: {ex.on ? "on" : "off"}
        </div>
      </div>
      {ex.showing && (
        <ExplainPanel
          id={ex.showing}
          onClose={() => explain.set(dismiss(explain.get()))}
          onOff={() => explain.set(toggle(explain.get()))}
        />
      )}
    </>
  );
}

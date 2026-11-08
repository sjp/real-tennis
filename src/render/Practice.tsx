import { useFrame, Canvas } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import { mergeInputs, touch as createTouch, type Touch } from "../input/touch.ts";
import { useTouchShown } from "./inputMode.ts";
import { TouchControls } from "./TouchControls.tsx";
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
import { PauseMenu } from "./pause.tsx";
import { createHud, useHud, type HudStore } from "./hud.ts";
import { usePlayUi } from "./playUi.ts";
import { ExplainPanel, Highlight } from "./teach.tsx";
import { Court } from "./Court.tsx";
import { AssistRings, Ears, FollowCamera, ServeLine } from "./scene.tsx";
import { hear } from "../audio/engine.ts";
import { length } from "../sim/vec.ts";
import { cameraStart, describeEvent, describeNotice, panel, hudPanel, DPR, FPS } from "./view.ts";
import { FpsMeter, FpsProbe } from "./Fps.tsx";
import {
  BALL_JUMP,
  blendAthlete,
  blendTime,
  blendVec,
  createBlend,
  STEP_FIRST,
  type Blend,
} from "./blend.ts";
import { Player } from "./Player.tsx";
import { settings, useSettings } from "./settings.ts";

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

interface Hud {
  readonly choice: string;
  readonly last: string | null;
  /** The Marker's calls for the current rest. */
  readonly calls: readonly string[];
  readonly event: string | null;
}

/** Steps the game at a fixed rate, and draws the ball between steps. */
const Loop = memo(function Loop({
  store,
  pad,
  explain,
  isPaused,
  hud,
  blend,
}: {
  store: Store;
  pad: Touch;
  explain: ExplainStore;
  /** Play is frozen, e.g. while the Marker explains. */
  isPaused: () => boolean;
  hud: HudStore<Hud>;
  /** Where the views draw from: the state before the latest step, and how far past it. */
  blend: Blend<PracticeState>;
}) {
  const ball = useRef<Mesh>(null);
  const keys = useMemo(() => keyboard(), []);
  const loop = useRef({ acc: 0, paused: false });

  useEffect(
    () => () => {
      keys.dispose();
    },
    [keys],
  );

  useFrame((_, delta) => {
    const l = loop.current;
    let input = mergeInputs(keys.read(), pad.read());
    // Frozen while the Marker explains; the key that resumes isn't a swing.
    const paused = isPaused();
    if (paused || l.paused) {
      l.paused = paused;
      l.acc = 0;
      return;
    }
    l.acc += Math.min(delta, 0.1);
    while (l.acc >= STEP && !isPaused()) {
      const before = store.get();
      blend.stepping(before);
      const r = practiceStep(world, before, input, settings.get().autoHit);
      hear(r.events, length(before.sim.ball.velocity), () => before.shot);
      store.set(r.state);
      input = { ...input, swing: false, select: null };
      l.acc -= STEP;
      if (before.shot !== r.state.shot || before.serveStyle !== r.state.serveStyle)
        hud.set({ choice: choice(r.state) });
      for (const n of r.notices) hud.set(describeNotice(n));
      const rally = r.state.rally;
      explainCalls(explain, r.calls, rally?.outcome !== null || rally.striker === null);
      if (r.calls.length > 0)
        hud.set((h) => ({
          calls: [...h.calls, ...r.calls.map((c) => `${c.message} (Law ${c.law})`)].slice(-3),
        }));
      for (const e of r.events) {
        const text = describeEvent(e);
        if (text) hud.set({ event: text });
      }
    }
    blend.at(l.acc / STEP);
    const at = drawnBall(blend, store.get());
    ball.current?.position.set(at.x, at.y, at.z);
    // Before anything draws from the state this frame.
  }, STEP_FIRST);

  return (
    <mesh ref={ball}>
      <sphereGeometry args={[world.ball.radius, 16, 12]} />
      <meshStandardMaterial color="#f5f0e1" />
    </mesh>
  );
});

const HELP = [
  "WASD / arrows: move · Space: swing",
  "1 drive · 2 cut · 3 lob · 4 boast (serving: 1–8 serve style)",
  "R: drop feed · F: machine feed · Q: serve · E: change ends · H: hit assist",
  "M: court markings · X: explanations on/off · ?: rules · Esc: pause",
];

interface Command {
  readonly code: string;
  /** Its touch button. */
  readonly label: string;
  readonly run: (s: PracticeState) => PracticeState;
}

const COMMANDS: readonly Command[] = [
  { code: "KeyR", label: "Drop", run: (s) => feedDrop(court, s) },
  { code: "KeyF", label: "Feed", run: (s) => feedMachine(world, s, Math.random) },
  { code: "KeyQ", label: "Serve", run: (s) => startServe(court, s) },
  { code: "KeyE", label: "Ends", run: (s) => changeEnds(court, s) },
];

function PracticeHud({ hud }: { hud: HudStore<Hud> }) {
  const h = useHud(hud, (h) => h);
  // On a phone, nothing: it covers the court.
  if (useTouchShown()) return null;
  return (
    <div style={hudPanel}>
      <div>{h.choice}</div>
      {h.last && <div>{h.last}</div>}
      {h.event && <div style={{ color: "#4cc9f0" }}>{h.event}</div>}
      {h.calls.map((c, i) => (
        <div key={i} style={{ color: "#ffd166" }}>
          {c}
        </div>
      ))}
    </div>
  );
}

/** The touch controls, re-reading the player's choices whenever the HUD changes. */
function PracticeTouch({
  hud,
  store,
  pad,
  command,
  onPause,
}: {
  hud: HudStore<Hud>;
  store: Store;
  pad: Touch;
  command: (c: Command) => void;
  onPause: () => void;
}) {
  // The player's choices change along with the HUD, so re-read them on every update.
  useHud(hud, (h) => h);
  return (
    <TouchControls
      touch={pad}
      athlete={store.get()}
      extras={COMMANDS.map((c) => ({
        label: c.label,
        onPress: () => {
          command(c);
        },
      }))}
      onPause={onPause}
    />
  );
}

/** The ball as drawn, between the last two steps. */
const drawnBall = (blend: Blend<PracticeState>, s: PracticeState) =>
  blendVec(blend.prev().sim.ball.position, s.sim.ball.position, blend.t(), BALL_JUMP);

/**
 * The scene's views of the game, made once so the scene can skip re-rendering.
 * The figure and the camera are drawn between steps; the hit assist predicts
 * from the stepped state, as the game does.
 */
function sceneViews(store: Store, explain: ExplainStore, blend: Blend<PracticeState>) {
  const drawn = () => blendAthlete(blend.prev(), store.get(), blend.t());
  return {
    serving: () => store.get().serve !== null,
    player: () => {
      const s = store.get();
      return { athlete: drawn(), time: blendTime(blend.prev().sim.time, s.sim.time, blend.t()) };
    },
    assist: () => store.get(),
    camera: () => {
      const s = store.get();
      const me = drawn();
      return {
        at: me.motion.position,
        end: me.end,
        ball: s.sim.live ? drawnBall(blend, s) : null,
        focus: focusOf(explain),
      };
    },
  };
}

/** Solo practice: move, hit, and serve, with no opponent. */
export function Practice() {
  const [store] = useState(createStore);
  const [explain] = useState(createExplainStore);
  const ex = useExplainer(explain);
  const ui = usePlayUi(explain);
  const [pad] = useState(createTouch);
  const touchShown = useTouchShown();
  const held = ui.held;
  const [isPaused] = useState(() => () => held() || explain.get().showing !== null);
  const [blend] = useState(() => createBlend(store.get()));
  const [views] = useState(() => sceneViews(store, explain, blend));
  const feature = ex.showing && EXPLANATIONS[ex.showing].feature;
  const [hud] = useState(() =>
    createHud<Hud>({ choice: choice(store.get()), last: null, calls: [], event: null }),
  );

  const [command] = useState(() => (c: Command) => {
    // No feeds while paused, or while the Marker explains.
    if (held() || explain.get().showing) return;
    store.set(c.run(store.get()));
    hud.set({ choice: choice(store.get()), calls: [], event: null });
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const c = COMMANDS.find((c) => c.code === e.code);
      if (c) command(c);
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
  }, [command]);

  const s = store.get();
  const { assist } = useSettings();

  return (
    <>
      <Canvas dpr={DPR} camera={{ position: cameraStart(s.motion.position, s.end), fov: 55 }}>
        <color attach="background" args={["#101418"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 12, -6]} intensity={1.8} />
        <directionalLight position={[-6, 8, 10]} intensity={0.6} />
        <Court court={court} />
        <Ears />
        {FPS && <FpsProbe />}
        <ServeLine visible={views.serving} />
        <Player view={views.player} />
        <Loop
          store={store}
          pad={pad}
          explain={explain}
          isPaused={isPaused}
          hud={hud}
          blend={blend}
        />
        {feature && <Highlight feature={feature} />}
        {ui.markings && <Markings />}
        <AssistRings view={views.assist} on={assist} />
        <FollowCamera target={views.camera} />
      </Canvas>
      {FPS && <FpsMeter />}
      <PracticeHud hud={hud} />
      {touchShown ? (
        !ui.menu &&
        !ui.rules &&
        !ex.showing && (
          <PracticeTouch
            hud={hud}
            store={store}
            pad={pad}
            command={command}
            onPause={() => {
              ui.setMenu(true);
            }}
          />
        )
      ) : (
        <div style={{ ...panel, left: 12, bottom: 12, fontSize: 12, color: "#b8b8b8" }}>
          {HELP.map((h) => (
            <div key={h}>{h}</div>
          ))}
          <div>
            Hit assist: {assist ? "on" : "off"} · Explanations: {ex.on ? "on" : "off"}
          </div>
        </div>
      )}
      <PauseMenu
        ui={ui}
        explain={explain}
        leave="Back to the menu"
        onLeave={() => {
          location.assign(location.pathname);
        }}
      />
      {ex.showing && (
        <ExplainPanel
          id={ex.showing}
          onClose={() => {
            explain.set(dismiss(explain.get()));
          }}
          onOff={() => {
            explain.set(toggle(explain.get()));
          }}
        />
      )}
    </>
  );
}

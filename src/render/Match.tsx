import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import { aiInput, FRESH, type AiMemory } from "../ai/ai.ts";
import { AI_PRESETS, type AiLevel } from "../ai/presets.ts";
import { standardCourt as court } from "../court/standard.ts";
import { athleteOf, playStep, startPlay, type PlayState } from "../game/play.ts";
import { playerCapsule, type Athlete } from "../game/player.ts";
import { PLAYER_ID } from "../game/practice.ts";
import { keyboard } from "../input/keyboard.ts";
import { mergeInputs, touch as createTouch, type Touch } from "../input/touch.ts";
import { useTouchShown } from "./inputMode.ts";
import { TouchControls } from "./TouchControls.tsx";
import { SERVE_STYLES } from "../player/serve.ts";
import type { MatchConfig } from "../rules/match.ts";
import { settings, useSettings, type MatchSetup as Setup } from "./settings.ts";
import { callScore, type Labels } from "../rules/score.ts";
import type { ChaseCall } from "../court/chase.ts";
import type { MatchState } from "../rules/match.ts";
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
import { ChaseMarkers, Markings } from "./markings.tsx";
import { PauseMenu } from "./pause.tsx";
import { Summary } from "./Summary.tsx";
import { decided, strokesIn, type Rest } from "../game/summary.ts";
import { createHud, useHud, type HudStore } from "./hud.ts";
import { usePlayUi } from "./playUi.ts";
import { ExplainPanel, Highlight } from "./teach.tsx";
import { Court } from "./Court.tsx";
import { Player } from "./Player.tsx";
import { AssistRings, Ears, FollowCamera, ServeLine } from "./scene.tsx";
import { hear } from "../audio/engine.ts";
import { length } from "../sim/vec.ts";
import {
  cameraStart,
  describeEvent,
  describeNotice,
  HIGHLIGHT,
  panel,
  hudPanel,
  centred,
  DPR,
  FPS,
} from "./view.ts";
import { FpsMeter, FpsProbe } from "./Fps.tsx";

const world = createWorld(court);
const OPPONENT_ID = "opponent";
const LABELS: Labels = { [PLAYER_ID]: "Player", [OPPONENT_ID]: "Opponent" };
const OPPONENT_TRIM = "#b5443c";

interface Game {
  readonly play: PlayState;
  readonly memory: AiMemory;
  /** Decided rests, for the summary. */
  readonly rests: readonly Rest[];
  /** Strokes in the rest in play. */
  readonly strokes: number;
}

/** The match, owned outside React and stepped every frame. */
interface Store {
  get(): Game;
  set(g: Game): void;
}

function createStore(game: Game): Store {
  let state = game;
  return {
    get: () => state,
    set: (g) => {
      state = g;
    },
  };
}

interface Hud {
  readonly score: string;
  readonly choice: string;
  readonly last: string | null;
  /** The Marker's latest calls. */
  readonly calls: readonly string[];
  readonly event: string | null;
  readonly over: boolean;
  /** Chases laid, or being played off. */
  readonly chases: readonly ChaseCall[];
  readonly playingOff: boolean;
}

const human = (store: Store): Athlete => athleteOf(store.get().play, PLAYER_ID);

function choice(a: Athlete): string {
  return a.serve !== null ? `Serve: ${SERVE_STYLES[a.serveStyle]!.name}` : `Shot: ${a.shot}`;
}

function chasesOf(m: MatchState): Pick<Hud, "chases" | "playingOff"> {
  return m.playOff.length > 0
    ? { chases: m.playOff, playingOff: true }
    : { chases: m.chases, playingOff: false };
}

/** Games and sets so far, e.g. "Games 2–1 · Sets 0–0" (the player first). */
function tally(p: PlayState): string {
  const m = p.match;
  const pair = (t: typeof m.games) => `${String(t[PLAYER_ID] ?? 0)}–${String(t[OPPONENT_ID] ?? 0)}`;
  return m.config.sets === 1
    ? `Games ${pair(m.games)}`
    : `Games ${pair(m.games)} · Sets ${pair(m.sets)}`;
}

/** Steps the match at a fixed rate, with the AI playing the opponent. */
const Loop = memo(function Loop({
  game,
  pad,
  level,
  explain,
  isPaused,
  hud,
}: {
  game: Store;
  pad: Touch;
  level: AiLevel;
  explain: ExplainStore;
  /** Play is frozen, e.g. while the Marker explains. */
  isPaused: () => boolean;
  hud: HudStore<Hud>;
}) {
  const ball = useRef<Mesh>(null);
  const keys = useMemo(() => keyboard(), []);
  const loop = useRef({ prev: game.get().play.sim.ball.position, acc: 0, paused: false });

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
      const { play: before, memory, rests, strokes: struck } = game.get();
      l.prev = before.sim.ball.position;
      const view = {
        me: athleteOf(before, OPPONENT_ID),
        sim: before.sim,
        rally: before.rally,
        live: before.phase === "play",
        since: before.since,
      };
      const capsule = playerCapsule(view.me);
      const ai = aiInput(world, view, AI_PRESETS[level], memory, Math.random, capsule);
      const r = playStep(
        world,
        before,
        { [PLAYER_ID]: input, [OPPONENT_ID]: ai.input },
        settings.get().autoHit ? [PLAYER_ID] : [],
      );
      const strokes = struck + strokesIn(before, r.events);
      const rest = decided(before, r.state, strokes);
      game.set({
        play: r.state,
        memory: ai.memory,
        rests: rest ? [...rests, rest] : rests,
        strokes: rest ? 0 : strokes,
      });
      hear(r.events, length(before.sim.ball.velocity), (p) => athleteOf(before, p).shot);
      input = { ...input, swing: false, select: null };
      l.acc -= STEP;

      const was = athleteOf(before, PLAYER_ID);
      const now = athleteOf(r.state, PLAYER_ID);
      if (choice(was) !== choice(now)) hud.set({ choice: choice(now) });
      for (const n of r.notices) if (n.player === PLAYER_ID) hud.set(describeNotice(n.notice));
      for (const e of r.events) {
        const text = describeEvent(e);
        if (text) hud.set({ event: text });
      }
      explainCalls(explain, r.calls, r.state.phase !== "play" || r.state.rally.striker === null);
      if (r.calls.length > 0)
        hud.set((h) => ({
          calls: [...h.calls, ...r.calls.map((c) => `${c.message} (Law ${c.law})`)].slice(-4),
        }));
      if (before.match !== r.state.match)
        hud.set({
          score: `${callScore(r.state.match, LABELS)} · ${tally(r.state)}`,
          over: r.state.phase === "over",
          ...chasesOf(r.state.match),
        });
    }
    const a = l.prev;
    const b = game.get().play.sim.ball.position;
    const t = l.acc / STEP;
    ball.current?.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  });

  return (
    <mesh ref={ball}>
      <sphereGeometry args={[world.ball.radius, 16, 12]} />
      <meshStandardMaterial color="#f5f0e1" />
    </mesh>
  );
});

const HELP = [
  "WASD / arrows: move · Shift: sprint · Space: swing (serving: toss, then swing)",
  "1 drive · 2 cut · 3 lob · 4 boast (serving: 1–8 serve style)",
  "H: hit assist · M: court markings · X: explanations on/off · ?: rules · Esc: pause",
];

function MatchHud({ hud }: { hud: HudStore<Hud> }) {
  const h = useHud(hud, (h) => h);
  return (
    <div style={hudPanel}>
      <div style={{ color: "#ffffff", fontWeight: "bold" }}>{h.score}</div>
      {h.chases.length > 0 && (
        <div style={{ color: "#f28482" }}>
          {h.playingOff ? "Playing for: " : "Chases: "}
          {h.chases.map((c) => c.name).join(" · ")}
        </div>
      )}
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

const Chases = memo(function Chases({ hud }: { hud: HudStore<Hud> }) {
  return <ChaseMarkers chases={useHud(hud, (h) => h.chases)} />;
});

/** The touch controls, re-reading the player's choices whenever the HUD changes. */
function MatchTouch({
  hud,
  game,
  pad,
  onPause,
}: {
  hud: HudStore<Hud>;
  game: Store;
  pad: Touch;
  onPause: () => void;
}) {
  // The player's choices change along with the HUD, so re-read them on every update.
  useHud(hud, (h) => h);
  return <TouchControls touch={pad} athlete={human(game)} onPause={onPause} />;
}

/** The scene's views of the match, made once so the scene can skip re-rendering. */
function sceneViews(game: Store, explain: ExplainStore) {
  const time = () => game.get().play.sim.time;
  return {
    serving: () => human(game).serve !== null,
    player: () => ({ athlete: human(game), time: time() }),
    opponent: () => ({ athlete: athleteOf(game.get().play, OPPONENT_ID), time: time() }),
    assist: () => {
      const me = human(game);
      return { sim: game.get().play.sim, motion: me.motion, end: me.end };
    },
    camera: () => {
      const sim = game.get().play.sim;
      const me = human(game);
      return {
        at: me.motion.position,
        end: me.end,
        ball: sim.live ? sim.ball.position : null,
        focus: focusOf(explain),
      };
    },
  };
}

function MatchGame({ setup, onQuit }: { setup: Setup; onQuit: () => void }) {
  const [start] = useState(() => {
    const config: MatchConfig = {
      players: [PLAYER_ID, OPPONENT_ID],
      sets: setup.sets,
      suddenDeath: setup.suddenDeath,
    };
    return startPlay(world, config, Math.random, LABELS);
  });
  const [game] = useState(() =>
    createStore({ play: start.state, memory: FRESH, rests: [], strokes: 0 }),
  );
  const [explain] = useState(() => {
    const store = createExplainStore();
    explainCalls(store, start.calls, true);
    return store;
  });
  const ex = useExplainer(explain);
  const ui = usePlayUi(explain);
  const [pad] = useState(createTouch);
  const touchShown = useTouchShown();
  const held = ui.held;
  const [isPaused] = useState(() => () => held() || explain.get().showing !== null);
  const [views] = useState(() => sceneViews(game, explain));
  const feature = ex.showing && EXPLANATIONS[ex.showing].feature;
  const [hud] = useState(() =>
    createHud<Hud>({
      score: `${callScore(start.state.match, LABELS)} · ${tally(start.state)}`,
      choice: choice(human(game)),
      last: null,
      calls: start.calls.map((c) => `${c.message} (Law ${c.law})`),
      event: null,
      over: false,
      ...chasesOf(start.state.match),
    }),
  );
  const over = useHud(hud, (h) => h.over);

  const me = human(game);
  const { assist } = useSettings();
  return (
    <>
      <Canvas dpr={DPR} camera={{ position: cameraStart(me.motion.position, me.end), fov: 55 }}>
        <color attach="background" args={["#101418"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 12, -6]} intensity={1.8} />
        <directionalLight position={[-6, 8, 10]} intensity={0.6} />
        <Court court={court} />
        <Ears />
        {FPS && <FpsProbe />}
        <ServeLine visible={views.serving} />
        <Player view={views.player} />
        <Player view={views.opponent} trim={OPPONENT_TRIM} />
        <Loop
          game={game}
          pad={pad}
          level={setup.level}
          explain={explain}
          isPaused={isPaused}
          hud={hud}
        />
        {feature && <Highlight feature={feature} />}
        {ui.markings && <Markings />}
        <Chases hud={hud} />
        <AssistRings view={views.assist} on={assist} />
        <FollowCamera target={views.camera} />
      </Canvas>
      {FPS && <FpsMeter />}
      <MatchHud hud={hud} />
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
      <PauseMenu ui={ui} explain={explain} leave="Leave the match" onLeave={onQuit} />
      {over && (
        <Summary
          match={game.get().play.match}
          rests={game.get().rests}
          you={PLAYER_ID}
          them={OPPONENT_ID}
          onNew={onQuit}
        />
      )}
      {touchShown ? (
        !ui.menu &&
        !ui.rules &&
        !ex.showing &&
        !over && (
          <MatchTouch
            hud={hud}
            game={game}
            pad={pad}
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
            Opponent: {setup.level} · Hit assist: {assist ? "on" : "off"} · Explanations:{" "}
            {ex.on ? "on" : "off"}
          </div>
        </div>
      )}
    </>
  );
}

const LEVELS: readonly AiLevel[] = ["easy", "medium", "hard"];

function StartPanel({ onStart }: { onStart: (s: Setup) => void }) {
  const setup = useSettings().match;
  const setSetup = (match: Setup) => {
    settings.set({ match });
  };
  const row = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    margin: "8px 0",
  } as const;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#101418" }}>
      <div style={centred}>
        <div style={{ fontSize: 18, marginBottom: 8 }}>Real tennis: a match</div>
        <div style={row}>
          Opponent:
          {LEVELS.map((level) => (
            <label key={level}>
              <input
                type="radio"
                checked={setup.level === level}
                onChange={() => {
                  setSetup({ ...setup, level });
                }}
              />{" "}
              {level}
            </label>
          ))}
        </div>
        <div style={row}>
          Best of:
          {([1, 3, 5] as const).map((sets) => (
            <label key={sets}>
              <input
                type="radio"
                checked={setup.sets === sets}
                onChange={() => {
                  setSetup({ ...setup, sets });
                }}
              />{" "}
              {sets} {sets === 1 ? "set" : "sets"}
            </label>
          ))}
        </div>
        <div style={row}>
          <label>
            <input
              type="checkbox"
              checked={setup.suddenDeath}
              onChange={(e) => {
                setSetup({ ...setup, suddenDeath: e.target.checked });
              }}
            />{" "}
            Sudden death at forty all (Law 12.1(b))
          </label>
        </div>
        <button
          onClick={() => {
            onStart(setup);
          }}
        >
          Toss for service and play
        </button>
        <a href="?" style={{ color: HIGHLIGHT, marginLeft: 12 }}>
          Menu
        </a>
      </div>
    </div>
  );
}

/** A singles match against the AI (060). */
export function Match() {
  const [setup, setSetup] = useState<Setup | null>(null);
  if (!setup) return <StartPanel onStart={setSetup} />;
  return (
    <MatchGame
      setup={setup}
      onQuit={() => {
        setSetup(null);
      }}
    />
  );
}

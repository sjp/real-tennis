import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import { aiInput, FRESH, type AiMemory } from "../ai/ai.ts";
import { AI_PRESETS, type AiLevel } from "../ai/presets.ts";
import { standardCourt as court } from "../court/standard.ts";
import { athleteOf, playStep, startPlay, type PlayState } from "../game/play.ts";
import { playerCapsule, type Athlete } from "../game/player.ts";
import { PLAYER_ID } from "../game/practice.ts";
import { keyboard } from "../input/keyboard.ts";
import { SERVE_STYLES } from "../player/serve.ts";
import type { MatchConfig } from "../rules/match.ts";
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
import { ExplainPanel, Highlight } from "./teach.tsx";
import { Court } from "./Court.tsx";
import { Player } from "./Player.tsx";
import { AssistRings, FollowCamera, ServeLine } from "./scene.tsx";
import { cameraStart, describeEvent, describeNotice, panel } from "./view.ts";

const world = createWorld(court);
const OPPONENT_ID = "opponent";
const LABELS: Labels = { [PLAYER_ID]: "Player", [OPPONENT_ID]: "Opponent" };
const OPPONENT_SHIRT = "#b5443c";

interface Setup {
  readonly level: AiLevel;
  readonly sets: MatchConfig["sets"];
  readonly suddenDeath: boolean;
}

interface Game {
  readonly play: PlayState;
  readonly memory: AiMemory;
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
  readonly assist: boolean;
  readonly markings: boolean;
  readonly over: boolean;
  /** Chases laid, or being played off. */
  readonly chases: readonly ChaseCall[];
  readonly playingOff: boolean;
}

type HudChange = Partial<Hud> | ((old: Hud) => Partial<Hud>);

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
  const pair = (t: typeof m.games) => `${t[PLAYER_ID]}–${t[OPPONENT_ID]}`;
  return m.config.sets === 1
    ? `Games ${pair(m.games)}`
    : `Games ${pair(m.games)} · Sets ${pair(m.sets)}`;
}

/** Steps the match at a fixed rate, with the AI playing the opponent. */
function Loop({
  game,
  level,
  explain,
  onHud,
}: {
  game: Store;
  level: AiLevel;
  explain: ExplainStore;
  onHud: (h: HudChange) => void;
}) {
  const ball = useRef<Mesh>(null);
  const keys = useMemo(() => keyboard(), []);
  const loop = useRef({ prev: game.get().play.sim.ball.position, acc: 0, paused: false });

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
      const { play: before, memory } = game.get();
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
      const r = playStep(world, before, { [PLAYER_ID]: input, [OPPONENT_ID]: ai.input });
      game.set({ play: r.state, memory: ai.memory });
      input = { ...input, swing: false, select: null };
      l.acc -= STEP;

      const was = athleteOf(before, PLAYER_ID);
      const now = athleteOf(r.state, PLAYER_ID);
      if (choice(was) !== choice(now)) onHud({ choice: choice(now) });
      for (const n of r.notices) if (n.player === PLAYER_ID) onHud(describeNotice(n.notice));
      for (const e of r.events) {
        const text = describeEvent(e);
        if (text) onHud({ event: text });
      }
      explainCalls(explain, r.calls, r.state.phase !== "play" || r.state.rally.striker === null);
      if (r.calls.length > 0)
        onHud((h) => ({
          calls: [...h.calls, ...r.calls.map((c) => `${c.message} (Law ${c.law})`)].slice(-4),
        }));
      if (before.match !== r.state.match)
        onHud({
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
}

const HELP = [
  "WASD / arrows: move · Shift: sprint · Space: swing (serving: toss, then swing)",
  "1 drive · 2 cut · 3 lob · 4 boast (serving: 1–8 serve style)",
  "H: hit assist · M: court markings · X: explanations on/off · Esc: leave the match",
];

function MatchGame({ setup, onQuit }: { setup: Setup; onQuit: () => void }) {
  const [start] = useState(() => {
    const config: MatchConfig = {
      players: [PLAYER_ID, OPPONENT_ID],
      sets: setup.sets,
      suddenDeath: setup.suddenDeath,
    };
    return startPlay(world, config, Math.random, LABELS);
  });
  const [game] = useState(() => createStore({ play: start.state, memory: FRESH }));
  const [explain] = useState(() => {
    const store = createExplainStore();
    explainCalls(store, start.calls, true);
    return store;
  });
  const ex = useExplainer(explain);
  const feature = ex.showing && EXPLANATIONS[ex.showing].feature;
  const [hud, setHud] = useState<Hud>(() => ({
    score: `${callScore(start.state.match, LABELS)} · ${tally(start.state)}`,
    choice: choice(human(game)),
    last: null,
    calls: start.calls.map((c) => `${c.message} (Law ${c.law})`),
    event: null,
    assist: true,
    markings: false,
    over: false,
    ...chasesOf(start.state.match),
  }));
  const onHud = (h: HudChange) =>
    setHud((old) => ({ ...old, ...(typeof h === "function" ? h(old) : h) }));

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyH" && !e.repeat) setHud((h) => ({ ...h, assist: !h.assist }));
      if (e.code === "KeyX" && !e.repeat) explain.set(toggle(explain.get()));
      if (e.code === "KeyM" && !e.repeat) setHud((h) => ({ ...h, markings: !h.markings }));
      if (e.code === "Escape") onQuit();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [onQuit, explain]);

  const me = human(game);
  return (
    <>
      <Canvas camera={{ position: cameraStart(me.motion.position, me.end), fov: 55 }}>
        <color attach="background" args={["#101418"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 12, -6]} intensity={1.8} />
        <directionalLight position={[-6, 8, 10]} intensity={0.6} />
        <Court court={court} />
        <ServeLine visible={() => human(game).serve !== null} />
        <Player view={() => ({ athlete: human(game), time: game.get().play.sim.time })} />
        <Player
          view={() => ({
            athlete: athleteOf(game.get().play, OPPONENT_ID),
            time: game.get().play.sim.time,
          })}
          shirt={OPPONENT_SHIRT}
        />
        <Loop game={game} level={setup.level} explain={explain} onHud={onHud} />
        {feature && <Highlight feature={feature} />}
        {hud.markings && <Markings />}
        <ChaseMarkers chases={hud.chases} />
        <AssistRings
          view={() => ({
            sim: game.get().play.sim,
            motion: human(game).motion,
            end: human(game).end,
          })}
          on={hud.assist}
        />
        <FollowCamera
          target={() => {
            const sim = game.get().play.sim;
            const me = human(game);
            return {
              at: me.motion.position,
              end: me.end,
              ball: sim.live ? sim.ball.position : null,
              focus: focusOf(explain),
            };
          }}
        />
      </Canvas>
      <div style={{ ...panel, left: 12, top: 12 }}>
        <div style={{ color: "#ffffff", fontWeight: "bold" }}>{hud.score}</div>
        {hud.chases.length > 0 && (
          <div style={{ color: "#f28482" }}>
            {hud.playingOff ? "Playing for: " : "Chases: "}
            {hud.chases.map((c) => c.name).join(" · ")}
          </div>
        )}
        <div>{hud.choice}</div>
        {hud.last && <div>{hud.last}</div>}
        {hud.event && <div style={{ color: "#4cc9f0" }}>{hud.event}</div>}
        {hud.calls.map((c, i) => (
          <div key={i} style={{ color: "#ffd166" }}>
            {c}
          </div>
        ))}
      </div>
      {ex.showing && (
        <ExplainPanel
          id={ex.showing}
          onClose={() => explain.set(dismiss(explain.get()))}
          onOff={() => explain.set(toggle(explain.get()))}
        />
      )}
      {hud.over && (
        <div style={{ ...panel, left: "50%", top: "40%", transform: "translate(-50%, -50%)" }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>{hud.score}</div>
          <button onClick={onQuit}>New match</button>
        </div>
      )}
      <div style={{ ...panel, left: 12, bottom: 12, fontSize: 12, color: "#b8b8b8" }}>
        {HELP.map((h) => (
          <div key={h}>{h}</div>
        ))}
        <div>
          Opponent: {setup.level} · Hit assist: {hud.assist ? "on" : "off"} · Explanations:{" "}
          {ex.on ? "on" : "off"}
        </div>
      </div>
    </>
  );
}

const LEVELS: readonly AiLevel[] = ["easy", "medium", "hard"];

function StartPanel({ onStart }: { onStart: (s: Setup) => void }) {
  const [setup, setSetup] = useState<Setup>({ level: "easy", sets: 1, suddenDeath: false });
  const row = { display: "flex", gap: 8, alignItems: "center", margin: "8px 0" } as const;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#101418" }}>
      <div style={{ ...panel, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <div style={{ fontSize: 18, marginBottom: 8 }}>Real tennis: a match</div>
        <div style={row}>
          Opponent:
          {LEVELS.map((level) => (
            <label key={level}>
              <input
                type="radio"
                checked={setup.level === level}
                onChange={() => setSetup({ ...setup, level })}
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
                onChange={() => setSetup({ ...setup, sets })}
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
              onChange={(e) => setSetup({ ...setup, suddenDeath: e.target.checked })}
            />{" "}
            Sudden death at forty all (Law 12.1(b))
          </label>
        </div>
        <button onClick={() => onStart(setup)}>Toss for service and play</button>
      </div>
    </div>
  );
}

/** A singles match against the AI (060). */
export function Match() {
  const [setup, setSetup] = useState<Setup | null>(null);
  if (!setup) return <StartPanel onStart={setSetup} />;
  return <MatchGame setup={setup} onQuit={() => setSetup(null)} />;
}

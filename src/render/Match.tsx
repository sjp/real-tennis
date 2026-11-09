import { memo, useState } from "react";
import { aiInput, FRESH, type AiMemory } from "../ai/ai.ts";
import { AI_PRESETS, type AiLevel } from "../ai/presets.ts";
import { athleteOf, CALL_PAUSE, playStep, startPlay, type PlayState } from "../game/play.ts";
import { restResult, type RestResult } from "../game/result.ts";
import { playerCapsule, type Athlete } from "../game/player.ts";
import { PLAYER_ID } from "../game/practice.ts";
import { touch as createTouch, type Touch } from "../input/touch.ts";
import { useCompact, useTouchShown } from "./inputMode.ts";
import type { MatchConfig } from "../rules/match.ts";
import { settings, useSettings, type MatchSetup as Setup } from "./settings.ts";
import { callScore, type Labels } from "../rules/score.ts";
import type { MatchState } from "../rules/match.ts";
import { EXPLANATIONS } from "../teach/content.ts";
import {
  createExplainStore,
  explainCalls,
  focusOf,
  useExplainer,
  type ExplainStore,
} from "./explainStore.ts";
import { PauseMenu } from "./pause.tsx";
import { Summary } from "./Summary.tsx";
import { RestModal } from "./RestModal.tsx";
import { Scoreboard, type Side } from "./Scoreboard.tsx";
import { decided, strokesIn, type Rest } from "../game/summary.ts";
import { createHud, useHud, type HudStore } from "./hud.ts";
import { usePlayUi } from "./playUi.ts";
import { Player, type PlayerView } from "./Player.tsx";
import { hear } from "../audio/engine.ts";
import { length } from "../sim/vec.ts";
import { describeEvent, describeNotice, HIGHLIGHT, hudPanel, centred, FPS } from "./view.ts";
import { FpsMeter } from "./Fps.tsx";
import { BALL_JUMP, blendAthlete, blendTime, blendVec, createBlend, type Blend } from "./blend.ts";
import {
  BallMesh,
  Explanation,
  HelpPanel,
  HudChases,
  PlayScene,
  PlayStage,
  PlayTouch,
  type PlayViews,
} from "./play.tsx";
import {
  chasesOf,
  choiceOf as choice,
  createStore,
  OPPONENT_TRIM,
  type Chases,
  type Store as StateStore,
} from "./playState.ts";
import { useStepLoop } from "./useStepLoop.ts";
import { world } from "./world.ts";

const OPPONENT_ID = "opponent";
const LABELS: Labels = { [PLAYER_ID]: "Player", [OPPONENT_ID]: "Opponent" };
/** The scoreboard's rows, in the players' colours lightened to read on the dark HUD. */
const SIDES: readonly [Side, Side] = [
  { id: PLAYER_ID, label: "Player", color: "#8ab8ff" },
  { id: OPPONENT_ID, label: "Opponent", color: "#ff9b8f" },
];

interface Game {
  readonly play: PlayState;
  readonly memory: AiMemory;
  /** Decided rests, for the summary. */
  readonly rests: readonly Rest[];
  /** Strokes in the rest in play. */
  readonly strokes: number;
}

/** The match, owned outside React and stepped every frame. */
type Store = StateStore<Game>;

interface Hud extends Chases {
  readonly match: MatchState;
  /** The Marker's call of the score. */
  readonly call: string;
  /** The rest just decided, shown until the Marker's pause ends (160). */
  readonly result: RestResult | null;
  readonly choice: string;
  readonly last: string | null;
  /** The Marker's latest calls. */
  readonly calls: readonly string[];
  readonly event: string | null;
  readonly over: boolean;
}

/** A request, from the result modal, to end the Marker's pause now. */
interface Skip {
  request(): void;
  /** Whether one was made since the last call. */
  take(): boolean;
}

function createSkip(): Skip {
  let requested = false;
  return {
    request: () => {
      requested = true;
    },
    take: () => {
      const r = requested;
      requested = false;
      return r;
    },
  };
}

const human = (store: Store): Athlete => athleteOf(store.get().play, PLAYER_ID);

/** Steps the match at a fixed rate, with the AI playing the opponent. */
const Loop = memo(function Loop({
  game,
  pad,
  level,
  explain,
  isPaused,
  hud,
  blend,
  skip,
}: {
  game: Store;
  pad: Touch;
  level: AiLevel;
  explain: ExplainStore;
  /** Play is frozen, e.g. while the Marker explains. */
  isPaused: () => boolean;
  hud: HudStore<Hud>;
  /** Where the views draw from: the state before the latest step, and how far past it. */
  blend: Blend<PlayState>;
  /** The result modal was dismissed: end the Marker's pause now. */
  skip: Skip;
}) {
  const ball = useStepLoop({
    pad,
    isPaused,
    blend,
    get: () => game.get().play,
    ballOf: (p) => p.sim.ball.position,
    frame: (input) => {
      if (!skip.take()) return input;
      const g = game.get();
      if (g.play.phase === "called")
        game.set({ ...g, play: { ...g.play, since: g.play.sim.time - CALL_PAUSE } });
      // The key that dismissed the result isn't a swing.
      return { ...input, swing: false };
    },
    step: (input) => {
      const { play: before, memory, rests, strokes: struck } = game.get();
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

      const was = athleteOf(before, PLAYER_ID);
      const now = athleteOf(r.state, PLAYER_ID);
      if (choice(was) !== choice(now)) hud.set({ choice: choice(now) });
      for (const n of r.notices) if (n.player === PLAYER_ID) hud.set(describeNotice(n.notice));
      for (const e of r.events) {
        const text = describeEvent(e);
        if (text) hud.set({ event: text });
      }
      if (rest) hud.set({ result: restResult(r.state.match, rest.outcome, r.calls, LABELS) });
      else if (r.state.phase !== "called" && hud.get().result) hud.set({ result: null });
      // Explanations wait for the result to close.
      const quiet = r.state.phase !== "play" || r.state.rally.striker === null;
      explainCalls(explain, r.calls, quiet && hud.get().result === null);
      if (r.calls.length > 0)
        hud.set((h) => ({
          calls: [...h.calls, ...r.calls.map((c) => `${c.message} (Law ${c.law})`)].slice(-4),
        }));
      if (before.match !== r.state.match)
        hud.set({
          match: r.state.match,
          call: callScore(r.state.match, LABELS),
          over: r.state.phase === "over",
          ...chasesOf(r.state.match),
        });
    },
  });
  return <BallMesh ball={ball} />;
});

const HELP = [
  "WASD / arrows: move · Space: swing (serving: toss, then swing)",
  "1 drive · 2 cut · 3 lob · 4 boast (serving: 1–8 serve style)",
  "H: hit assist · M: court markings · X: explanations on/off · ?: rules · Esc: pause",
];

function MatchHud({ hud }: { hud: HudStore<Hud> }) {
  const h = useHud(hud, (h) => h);
  // On a phone or small window, only the score and chases: the rest covers the court.
  const full = !useCompact();
  return (
    <div style={hudPanel}>
      <Scoreboard match={h.match} sides={SIDES} />
      <div style={{ color: "#ffffff", margin: "4px 0 2px" }}>{h.call}</div>
      {h.chases.length > 0 && (
        <div style={{ color: "#f28482" }}>
          {h.playingOff ? "Playing for: " : "Chases: "}
          {h.chases.map((c) => c.name).join(" · ")}
        </div>
      )}
      {full && (
        <>
          <div>{h.choice}</div>
          {h.last && <div>{h.last}</div>}
          {h.event && <div style={{ color: "#4cc9f0" }}>{h.event}</div>}
          {h.calls.map((c, i) => (
            <div key={i} style={{ color: "#ffd166" }}>
              {c}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** The result modal; play is frozen while it shows. */
function Result({ hud, skip }: { hud: HudStore<Hud>; skip: Skip }) {
  const result = useHud(hud, (h) => h.result);
  const [dismiss] = useState(() => () => {
    skip.request();
    hud.set({ result: null });
  });
  return result && <RestModal result={result} sides={SIDES} onDismiss={dismiss} />;
}

/**
 * The scene's views of the match, made once so the scene can skip re-rendering.
 * The figures and the camera are drawn between steps; the hit assist predicts
 * from the stepped state, as the game does.
 */
function sceneViews(
  game: Store,
  explain: ExplainStore,
  blend: Blend<PlayState>,
): PlayViews & { opponent: PlayerView } {
  const drawnBall = (play: PlayState) =>
    blendVec(blend.prev().sim.ball.position, play.sim.ball.position, blend.t(), BALL_JUMP);
  const drawn = (id: string) => {
    const prev = blend.prev();
    const t = blend.t();
    const play = game.get().play;
    return {
      athlete: blendAthlete(athleteOf(prev, id), athleteOf(play, id), t),
      time: blendTime(prev.sim.time, play.sim.time, t),
    };
  };
  return {
    serving: () => human(game).serve !== null,
    player: () => drawn(PLAYER_ID),
    opponent: () => drawn(OPPONENT_ID),
    assist: () => {
      const me = human(game);
      return { sim: game.get().play.sim, motion: me.motion, end: me.end };
    },
    camera: () => {
      const play = game.get().play;
      const me = drawn(PLAYER_ID).athlete;
      return {
        at: me.motion.position,
        end: me.end,
        ball: play.sim.live ? drawnBall(play) : null,
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
    createStore<Game>({ play: start.state, memory: FRESH, rests: [], strokes: 0 }),
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
  const compact = useCompact();
  const held = ui.held;
  const [blend] = useState(() => createBlend(game.get().play));
  const [views] = useState(() => sceneViews(game, explain, blend));
  const feature = ex.showing && EXPLANATIONS[ex.showing].feature;
  const [hud] = useState(() =>
    createHud<Hud>({
      match: start.state.match,
      call: callScore(start.state.match, LABELS),
      result: null,
      choice: choice(human(game)),
      last: null,
      calls: start.calls.map((c) => `${c.message} (Law ${c.law})`),
      event: null,
      over: false,
      ...chasesOf(start.state.match),
    }),
  );
  const over = useHud(hud, (h) => h.over);
  // Frozen while the Marker explains or the result shows.
  const [isPaused] = useState(
    () => () => held() || explain.get().showing !== null || hud.get().result !== null,
  );
  const [skip] = useState(createSkip);

  const me = human(game);
  const { assist } = useSettings();
  return (
    <>
      <PlayScene
        start={{ at: me.motion.position, end: me.end }}
        views={views}
        feature={feature}
        markings={ui.markings}
        assist={assist}
        stopped={ui.menu || ui.rules}
      >
        <Player view={views.opponent} trim={OPPONENT_TRIM} />
        <Loop
          game={game}
          pad={pad}
          level={setup.level}
          explain={explain}
          isPaused={isPaused}
          hud={hud}
          blend={blend}
          skip={skip}
        />
        <HudChases hud={hud} />
      </PlayScene>
      {FPS && <FpsMeter />}
      <MatchHud hud={hud} />
      <Explanation explain={explain} showing={ex.showing} />
      {!ui.menu && !ui.rules && !over && <Result hud={hud} skip={skip} />}
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
      {touchShown
        ? !ui.menu &&
          !ui.rules &&
          !ex.showing &&
          !over && <PlayTouch hud={hud} athlete={() => human(game)} pad={pad} ui={ui} />
        : !compact && (
            <HelpPanel lines={HELP}>
              <div>
                Opponent: {setup.level} · Hit assist: {assist ? "on" : "off"} · Explanations:{" "}
                {ex.on ? "on" : "off"}
              </div>
            </HelpPanel>
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
  // One canvas for every match: the start panel covers it (212).
  return (
    <PlayStage>
      {setup ? (
        <MatchGame
          setup={setup}
          onQuit={() => {
            setSetup(null);
          }}
        />
      ) : (
        <StartPanel onStart={setSetup} />
      )}
    </PlayStage>
  );
}

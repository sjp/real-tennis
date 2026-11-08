import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Mesh } from "three";
import type { ChaseCall } from "../court/chase.ts";
import { featureShape } from "../court/features.ts";
import { standardCourt as court } from "../court/standard.ts";
import { athleteOf } from "../game/play.ts";
import type { MatchState } from "../rules/match.ts";
import { keyboard } from "../input/keyboard.ts";
import { mergeInputs, touch as createTouch, type Touch } from "../input/touch.ts";
import { useTouchShown } from "./inputMode.ts";
import { TouchControls } from "./TouchControls.tsx";
import { SERVE_STYLES } from "../player/serve.ts";
import { createWorld, STEP, type SimState } from "../sim/world.ts";
import { EXPLANATIONS } from "../teach/content.ts";
import { dismiss, toggle } from "../teach/explain.ts";
import { learner, lessonStep, startLesson, type LessonState } from "../teach/lesson.ts";
import { LESSONS, OPPONENT_ID, type Lesson } from "../teach/lessons.ts";
import { word } from "../teach/wording.ts";
import { Court } from "./Court.tsx";
import {
  createExplainStore,
  explainCalls,
  focusOf,
  useExplainer,
  type ExplainStore,
} from "./explainStore.ts";
import { ChaseMarkers, Markings } from "./markings.tsx";
import { Player } from "./Player.tsx";
import { PauseMenu } from "./pause.tsx";
import { loadDone, saveDone } from "./progress.ts";
import { createHud, useHud, type HudStore } from "./hud.ts";
import { usePlayUi } from "./playUi.ts";
import { settings, useSettings } from "./settings.ts";
import { AssistRings, Ears, FollowCamera, ServeLine } from "./scene.tsx";
import { hear } from "../audio/engine.ts";
import { PLAYER_ID } from "../game/practice.ts";
import { length } from "../sim/vec.ts";
import { ExplainPanel, Highlight } from "./teach.tsx";
import {
  cameraStart,
  describeNotice,
  HIGHLIGHT,
  panel,
  hudPanel,
  centred,
  DPR,
  FPS,
} from "./view.ts";
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

const world = createWorld(court);
const OPPONENT_TRIM = "#b5443c";
interface Store {
  get(): LessonState;
  set(s: LessonState): void;
}

const simOf = (s: LessonState): SimState =>
  s.game.kind === "drill" ? s.game.practice.sim : s.game.play.sim;

/** Whether no rest is in play, so an explanation can show. */
function quiet(s: LessonState): boolean {
  if (s.game.kind === "match")
    return s.game.play.phase !== "play" || s.game.play.rally.striker === null;
  const rally = s.game.practice.rally;
  return rally?.outcome !== null || rally.striker === null;
}

function choice(s: LessonState): string {
  const a = learner(s);
  return a.serve !== null ? `Serve: ${SERVE_STYLES[a.serveStyle]!.name}` : `Shot: ${a.shot}`;
}

interface Hud {
  readonly progress: number;
  readonly done: boolean;
  readonly choice: string;
  readonly last: string | null;
  readonly calls: readonly string[];
  /** In a match lesson, chases laid, or being played off. */
  readonly chases: readonly ChaseCall[];
  readonly playingOff: boolean;
}

const matchOf = (s: LessonState): MatchState | null =>
  s.game.kind === "match" ? s.game.play.match : null;

/** One empty list, so a drill's HUD updates leave the chase markers alone. */
const NO_CHASES: readonly ChaseCall[] = [];

function chasesOf(s: LessonState): Pick<Hud, "chases" | "playingOff"> {
  const m = matchOf(s);
  if (!m) return { chases: NO_CHASES, playingOff: false };
  return m.playOff.length > 0
    ? { chases: m.playOff, playingOff: true }
    : { chases: m.chases, playingOff: false };
}

/** Steps the lesson at a fixed rate. */
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
  isPaused: () => boolean;
  hud: HudStore<Hud>;
  /** Where the views draw from: the state before the latest step, and how far past it. */
  blend: Blend<LessonState>;
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
    // Frozen while paused; the key that resumes isn't a swing.
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
      const r = lessonStep(world, before, input, Math.random, settings.get().autoHit);
      hear(r.events, length(simOf(before).ball.velocity), (p) =>
        p === PLAYER_ID ? learner(before).shot : undefined,
      );
      store.set(r.state);
      input = { ...input, swing: false, select: null };
      l.acc -= STEP;
      explainCalls(explain, r.calls, quiet(r.state));
      const notices = r.notices.map(describeNotice).filter((n) => n.last);
      if (
        r.scored ||
        r.calls.length > 0 ||
        notices.length > 0 ||
        choice(before) !== choice(r.state) ||
        matchOf(before) !== matchOf(r.state)
      )
        hud.set((h) => ({
          progress: r.state.progress,
          done: r.state.done,
          choice: choice(r.state),
          last: notices.at(-1)?.last ?? h.last,
          calls: [...h.calls, ...r.calls.map((c) => c.message)].slice(-3),
          ...chasesOf(r.state),
        }));
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
  "WASD / arrows: move · Space: swing (serving: toss, then swing)",
  "1 drive · 2 cut · 3 lob · 4 boast (serving: 1–8 serve style)",
  "H: hit assist · M: court markings · X: explanations on/off · ?: rules · Esc: pause",
];

function LessonHud({ hud, lesson }: { hud: HudStore<Hud>; lesson: Lesson }) {
  const h = useHud(hud, (h) => h);
  // On a phone, only the lesson and chases: the rest covers the court.
  const full = !useTouchShown();
  return (
    <div style={hudPanel}>
      <div style={{ color: "#ffffff", fontWeight: "bold" }}>{lesson.title}</div>
      <div style={{ color: HIGHLIGHT }}>
        {lesson.goal}: {Math.min(h.progress, lesson.count)} / {lesson.count}
      </div>
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

const Chases = memo(function Chases({ hud }: { hud: HudStore<Hud> }) {
  return <ChaseMarkers chases={useHud(hud, (h) => h.chases)} />;
});

/** The touch controls, re-reading the player's choices whenever the HUD changes. */
function LessonTouch({
  hud,
  store,
  pad,
  onPause,
}: {
  hud: HudStore<Hud>;
  store: Store;
  pad: Touch;
  onPause: () => void;
}) {
  // The player's choices change along with the HUD, so re-read them on every update.
  useHud(hud, (h) => h);
  return <TouchControls touch={pad} athlete={learner(store.get())} onPause={onPause} />;
}

/** The ball as drawn, between the last two steps. */
const drawnBall = (blend: Blend<LessonState>, s: LessonState) =>
  blendVec(simOf(blend.prev()).ball.position, simOf(s).ball.position, blend.t(), BALL_JUMP);

/** The opponent in a match lesson, if there is one. */
const opponentOf = (s: LessonState) =>
  s.game.kind === "match" ? athleteOf(s.game.play, OPPONENT_ID) : undefined;

/**
 * The scene's views of the lesson, made once so the scene can skip re-rendering.
 * The figures and the camera are drawn between steps; the hit assist predicts
 * from the stepped state, as the game does.
 */
function sceneViews(
  store: Store,
  explain: ExplainStore,
  lesson: Lesson,
  intro: () => boolean,
  blend: Blend<LessonState>,
) {
  const time = () => blendTime(simOf(blend.prev()).time, simOf(store.get()).time, blend.t());
  const me = () => blendAthlete(learner(blend.prev()), learner(store.get()), blend.t());
  return {
    serving: () => learner(store.get()).serve !== null,
    player: () => ({ athlete: me(), time: time() }),
    opponent: () => {
      const them = opponentOf(store.get());
      return them
        ? { athlete: blendAthlete(opponentOf(blend.prev()), them, blend.t()), time: time() }
        : { athlete: learner(store.get()), time: 0 };
    },
    assist: () => {
      const st = store.get();
      const a = learner(st);
      return { sim: simOf(st), motion: a.motion, end: a.end };
    },
    camera: () => {
      const st = store.get();
      const a = me();
      return {
        at: a.motion.position,
        end: a.end,
        ball: simOf(st).live ? drawnBall(blend, st) : null,
        focus:
          intro() && lesson.feature ? featureShape(court, lesson.feature).label : focusOf(explain),
      };
    },
  };
}

/** Shut until released, e.g. by starting from the intro. */
function createGate() {
  let held = true;
  return {
    held: () => held,
    release: () => {
      held = false;
    },
  };
}

function LessonGame({
  lesson,
  onDone,
  onNext,
  onQuit,
}: {
  lesson: Lesson;
  onDone: () => void;
  onNext: (() => void) | null;
  onQuit: () => void;
}) {
  const [store] = useState(() => {
    let state = startLesson(world, lesson);
    return {
      get: () => state,
      set: (s: LessonState) => {
        state = s;
      },
    };
  });
  const [explain] = useState(createExplainStore);
  const ex = useExplainer(explain);
  const [intro, setIntro] = useState(true);
  const ui = usePlayUi(explain);
  const [pad] = useState(createTouch);
  const touchShown = useTouchShown();
  // Holds play during the intro; read by the loop and the camera.
  const [gate] = useState(createGate);
  const uiHeld = ui.held;
  const [isPaused] = useState(
    () => () => gate.held() || uiHeld() || explain.get().showing !== null,
  );
  const [blend] = useState(() => createBlend(store.get()));
  const [views] = useState(() => sceneViews(store, explain, lesson, gate.held, blend));
  const [hud] = useState(() =>
    createHud<Hud>({
      progress: 0,
      done: false,
      choice: choice(store.get()),
      last: null,
      calls: [],
      ...chasesOf(store.get()),
    }),
  );
  const done = useHud(hud, (h) => h.done);

  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);

  useEffect(() => {
    const begin = () => {
      gate.release();
      setIntro(false);
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (gate.held() && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault();
        begin();
      }
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
  }, [gate]);

  const s = store.get();
  const me = learner(s);
  const feature = intro
    ? lesson.feature
    : ex.showing
      ? EXPLANATIONS[ex.showing].feature
      : undefined;
  const isMatch = s.game.kind === "match";
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
        {isMatch && <Player view={views.opponent} trim={OPPONENT_TRIM} />}
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
        <Chases hud={hud} />
        <AssistRings view={views.assist} on={assist} />
        <FollowCamera target={views.camera} />
      </Canvas>
      {FPS && <FpsMeter />}
      <LessonHud hud={hud} lesson={lesson} />
      {touchShown ? (
        !intro &&
        !done &&
        !ui.menu &&
        !ui.rules &&
        !ex.showing && (
          <LessonTouch
            hud={hud}
            store={store}
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
        </div>
      )}
      {intro && (
        <Centred>
          <div style={{ fontSize: 18, color: "#ffffff", marginBottom: 8 }}>{lesson.title}</div>
          {lesson.intro.map((p) => (
            <p key={p} style={{ margin: "0 0 8px" }}>
              {word(p, touchShown ? "touch" : "keys")}
            </p>
          ))}
          <div style={{ color: HIGHLIGHT, margin: "8px 0" }}>Goal: {lesson.goal}</div>
          <button
            onClick={() => {
              gate.release();
              setIntro(false);
            }}
          >
            {touchShown ? "Start" : "Start (Space)"}
          </button>
        </Centred>
      )}
      {done && (
        <Centred>
          <div style={{ fontSize: 18, color: "#ffffff", marginBottom: 8 }}>Lesson complete</div>
          <p style={{ margin: "0 0 12px" }}>{lesson.success}</p>
          <div style={{ display: "flex", gap: 8 }}>
            {onNext && <button onClick={onNext}>Next lesson</button>}
            <button onClick={onQuit}>All lessons</button>
          </div>
        </Centred>
      )}
      <PauseMenu ui={ui} explain={explain} leave="Back to the lessons" onLeave={onQuit} />
      {ex.showing && !intro && (
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

function Centred({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        ...centred,
        padding: "16px 20px",
        border: `1px solid ${HIGHLIGHT}`,
      }}
    >
      {children}
    </div>
  );
}

/** The guided tutorial (070): a list of lessons, each played in the court. */
export function Learn() {
  const [done, setDone] = useState(loadDone);
  const [playing, setPlaying] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  const open = (i: number) => {
    setPlaying(i);
    setAttempt((a) => a + 1);
  };

  if (playing !== null) {
    const lesson = LESSONS[playing]!;
    return (
      <LessonGame
        key={attempt}
        lesson={lesson}
        onDone={() => {
          setDone((d) => {
            if (d.includes(lesson.id)) return d;
            const next = [...d, lesson.id];
            saveDone(next);
            return next;
          });
        }}
        onNext={
          playing + 1 < LESSONS.length
            ? () => {
                open(playing + 1);
              }
            : null
        }
        onQuit={() => {
          setPlaying(null);
        }}
      />
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "auto", background: "#101418" }}>
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: 16,
          color: "#e8e8e8",
          font: "14px/1.6 ui-monospace, monospace",
        }}
      >
        <div style={{ fontSize: 20, color: "#ffffff" }}>Learn real tennis</div>
        <p>Short lessons, each with one goal. Retry as often as you like.</p>
        {LESSONS.map((l, i) => (
          <div
            key={l.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0 12px",
              alignItems: "center",
              margin: "6px 0",
            }}
          >
            <span style={{ width: 16, color: HIGHLIGHT }}>{done.includes(l.id) ? "✓" : ""}</span>
            <button
              onClick={() => {
                open(i);
              }}
              style={{ minWidth: "min(260px, 70vw)", textAlign: "left" }}
            >
              {i + 1}. {l.title}
            </button>
            <span style={{ color: "#888", fontSize: 12 }}>{l.goal}</span>
          </div>
        ))}
        <p style={{ marginTop: 16 }}>
          <a href="?" style={{ color: HIGHLIGHT }}>
            Back to the menu
          </a>
        </p>
      </div>
    </div>
  );
}

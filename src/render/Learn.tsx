import { memo, useEffect, useState, type ReactNode } from "react";
import { featureShape } from "../court/features.ts";
import type { Vec3 } from "../court/types.ts";
import { standardCourt as court } from "../court/standard.ts";
import { athleteOf } from "../game/play.ts";
import type { MatchState } from "../rules/match.ts";
import { touch as createTouch, type Touch } from "../input/touch.ts";
import { useCompact, useTouchShown } from "./inputMode.ts";
import type { SimState } from "../sim/world.ts";
import { EXPLANATIONS } from "../teach/content.ts";
import { learner, lessonStep, startLesson, type LessonState } from "../teach/lesson.ts";
import { LESSONS, OPPONENT_ID, type Lesson } from "../teach/lessons.ts";
import { word } from "../teach/wording.ts";
import {
  createExplainStore,
  explainCalls,
  focusOf,
  useExplainer,
  type ExplainStore,
} from "./explainStore.ts";
import { Player, type PlayerView } from "./Player.tsx";
import { PauseMenu } from "./pause.tsx";
import { loadDone, saveDone } from "./progress.ts";
import { createHud, useHud, type HudStore } from "./hud.ts";
import { usePlayUi } from "./playUi.ts";
import { settings, useSettings } from "./settings.ts";
import { hear } from "../audio/engine.ts";
import { PLAYER_ID } from "../game/practice.ts";
import { length } from "../sim/vec.ts";
import { describeNotice, HIGHLIGHT, hudPanel, centred, FPS } from "./view.ts";
import { FpsMeter } from "./Fps.tsx";
import { BALL_JUMP, blendAthlete, blendTime, blendVec, createBlend, type Blend } from "./blend.ts";
import {
  BallMesh,
  Explanation,
  HelpPanel,
  HudChases,
  PlayCanvas,
  PlayTouch,
  type PlayViews,
} from "./play.tsx";
import {
  chasesOf as matchChases,
  choiceOf,
  createStore,
  OPPONENT_TRIM,
  type Chases,
  type Store as StateStore,
} from "./playState.ts";
import { useStepLoop } from "./useStepLoop.ts";
import { world } from "./world.ts";

type Store = StateStore<LessonState>;

const simOf = (s: LessonState): SimState =>
  s.game.kind === "drill" ? s.game.practice.sim : s.game.play.sim;

/** Whether no rest is in play, so an explanation can show. */
function quiet(s: LessonState): boolean {
  if (s.game.kind === "match")
    return s.game.play.phase !== "play" || s.game.play.rally.striker === null;
  const rally = s.game.practice.rally;
  return rally?.outcome !== null || rally.striker === null;
}

const choice = (s: LessonState): string => choiceOf(learner(s));

interface Hud extends Chases {
  readonly progress: number;
  readonly done: boolean;
  readonly choice: string;
  readonly last: string | null;
  readonly calls: readonly string[];
}

const matchOf = (s: LessonState): MatchState | null =>
  s.game.kind === "match" ? s.game.play.match : null;

/** No chases, kept as one object so a drill's HUD updates leave the chase markers alone. */
const NO_CHASES: Chases = { chases: [], playingOff: false };

function chasesOf(s: LessonState): Chases {
  const m = matchOf(s);
  return m ? matchChases(m) : NO_CHASES;
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
  const ball = useStepLoop({
    pad,
    isPaused,
    blend,
    get: store.get,
    ballOf: (st) => simOf(st).ball.position,
    step: (input) => {
      const before = store.get();
      const r = lessonStep(world, before, input, Math.random, settings.get().autoHit);
      hear(r.events, length(simOf(before).ball.velocity), (p) =>
        p === PLAYER_ID ? learner(before).shot : undefined,
      );
      store.set(r.state);
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
    },
  });
  return <BallMesh ball={ball} />;
});

const HELP = [
  "WASD / arrows: move · Space: swing (serving: toss, then swing)",
  "1 drive · 2 cut · 3 lob · 4 boast (serving: 1–8 serve style)",
  "H: hit assist · M: court markings · X: explanations on/off · ?: rules · Esc: pause",
];

function LessonHud({ hud, lesson }: { hud: HudStore<Hud>; lesson: Lesson }) {
  const h = useHud(hud, (h) => h);
  // On a phone or small window, only the lesson and chases: the rest covers the court.
  const full = !useCompact();
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

/** The ball as drawn, between the last two steps. */
const drawnBall = (blend: Blend<LessonState>, s: LessonState): Vec3 =>
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
): PlayViews & { opponent: PlayerView } {
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
  const [store] = useState(() => createStore(startLesson(world, lesson)));
  const [explain] = useState(createExplainStore);
  const ex = useExplainer(explain);
  const [intro, setIntro] = useState(true);
  const ui = usePlayUi(explain);
  const [pad] = useState(createTouch);
  const touchShown = useTouchShown();
  const compact = useCompact();
  // Holds play during the intro; read by the loop and the camera.
  const [gate] = useState(createGate);
  const uiHeld = ui.held;
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
  // Frozen once the lesson is complete, behind its panel (204).
  const [isPaused] = useState(
    () => () => gate.held() || uiHeld() || explain.get().showing !== null || hud.get().done,
  );
  const [blend] = useState(() => createBlend(store.get()));
  const [views] = useState(() => sceneViews(store, explain, lesson, gate.held, blend));

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
      <PlayCanvas
        start={{ at: me.motion.position, end: me.end }}
        views={views}
        feature={feature}
        markings={ui.markings}
        assist={assist}
      >
        {isMatch && <Player view={views.opponent} trim={OPPONENT_TRIM} />}
        <Loop
          store={store}
          pad={pad}
          explain={explain}
          isPaused={isPaused}
          hud={hud}
          blend={blend}
        />
        <HudChases hud={hud} />
      </PlayCanvas>
      {FPS && <FpsMeter />}
      <LessonHud hud={hud} lesson={lesson} />
      {touchShown
        ? !intro &&
          !done &&
          !ui.menu &&
          !ui.rules &&
          !ex.showing && (
            <PlayTouch hud={hud} athlete={() => learner(store.get())} pad={pad} ui={ui} />
          )
        : !compact && <HelpPanel lines={HELP} />}
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
      {!intro && <Explanation explain={explain} showing={ex.showing} />}
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

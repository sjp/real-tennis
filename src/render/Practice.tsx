import { memo, useEffect, useState } from "react";
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
import { withModifier } from "../input/keyboard.ts";
import { touch as createTouch, type Touch } from "../input/touch.ts";
import { useCompact, useTouchShown } from "./inputMode.ts";
import { EXPLANATIONS } from "../teach/content.ts";
import {
  createExplainStore,
  explainCalls,
  focusOf,
  useExplainer,
  type ExplainStore,
} from "./explainStore.ts";
import { PauseMenu } from "./pause.tsx";
import { createHud, useHud, type HudStore } from "./hud.ts";
import { usePlayUi } from "./playUi.ts";
import { hear } from "../audio/engine.ts";
import { length } from "../sim/vec.ts";
import { describeEvent, describeNotice, hudPanel, FPS } from "./view.ts";
import { FpsMeter } from "./Fps.tsx";
import { BALL_JUMP, blendAthlete, blendTime, blendVec, createBlend, type Blend } from "./blend.ts";
import { settings, useSettings } from "./settings.ts";
import {
  BallMesh,
  Explanation,
  HelpPanel,
  PlayScene,
  PlayStage,
  PlayTouch,
  type PlayViews,
} from "./play.tsx";
import { choiceOf as choice, createStore, type Store } from "./playState.ts";
import { useStepLoop } from "./useStepLoop.ts";
import { world } from "./world.ts";

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
  store: Store<PracticeState>;
  pad: Touch;
  explain: ExplainStore;
  /** Play is frozen, e.g. while the Marker explains. */
  isPaused: () => boolean;
  hud: HudStore<Hud>;
  blend: Blend<PracticeState>;
}) {
  const ball = useStepLoop({
    pad,
    isPaused,
    blend,
    get: store.get,
    ballOf: (s) => s.sim.ball.position,
    step: (input) => {
      const before = store.get();
      const r = practiceStep(world, before, input, settings.get().autoHit);
      hear(r.events, length(before.sim.ball.velocity), () => before.shot);
      store.set(r.state);
      if (choice(before) !== choice(r.state)) hud.set({ choice: choice(r.state) });
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
    },
  });
  return <BallMesh ball={ball} />;
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
  // On a phone or small window, nothing: it covers the court.
  if (useCompact()) return null;
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

/**
 * The scene's views of the game, made once so the scene can skip re-rendering.
 * The figure and the camera are drawn between steps; the hit assist predicts
 * from the stepped state, as the game does.
 */
function sceneViews(
  store: Store<PracticeState>,
  explain: ExplainStore,
  blend: Blend<PracticeState>,
): PlayViews {
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
        ball: s.sim.live
          ? blendVec(blend.prev().sim.ball.position, s.sim.ball.position, blend.t(), BALL_JUMP)
          : null,
        focus: focusOf(explain),
      };
    },
  };
}

/** Solo practice: move, hit, and serve, with no opponent. */
export function Practice() {
  return (
    <PlayStage>
      <PracticeGame />
    </PlayStage>
  );
}

function PracticeGame() {
  const [store] = useState(() => createStore(initialPractice(world)));
  const [explain] = useState(createExplainStore);
  const ex = useExplainer(explain);
  const ui = usePlayUi(explain);
  const [pad] = useState(createTouch);
  const touchShown = useTouchShown();
  const compact = useCompact();
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
      // Not Ctrl+F (find) or Ctrl+R (reload): those are the browser's (202).
      if (e.repeat || withModifier(e)) return;
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
      <PlayScene
        start={{ at: s.motion.position, end: s.end }}
        views={views}
        feature={feature}
        markings={ui.markings}
        assist={assist}
        stopped={ui.menu || ui.rules}
      >
        <Loop
          store={store}
          pad={pad}
          explain={explain}
          isPaused={isPaused}
          hud={hud}
          blend={blend}
        />
      </PlayScene>
      {FPS && <FpsMeter />}
      <PracticeHud hud={hud} />
      {touchShown
        ? !ui.menu &&
          !ui.rules &&
          !ex.showing && (
            <PlayTouch
              hud={hud}
              athlete={store.get}
              pad={pad}
              ui={ui}
              extras={COMMANDS.map((c) => ({
                label: c.label,
                onPress: () => {
                  command(c);
                },
              }))}
            />
          )
        : !compact && (
            <HelpPanel lines={HELP}>
              <div>
                Hit assist: {assist ? "on" : "off"} · Explanations: {ex.on ? "on" : "off"}
              </div>
            </HelpPanel>
          )}
      <PauseMenu
        ui={ui}
        explain={explain}
        leave="Back to the menu"
        onLeave={() => {
          location.assign(location.pathname);
        }}
      />
      <Explanation explain={explain} showing={ex.showing} />
    </>
  );
}

import { advance, Canvas, useThree } from "@react-three/fiber";
import {
  createContext,
  Fragment,
  memo,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import type { Mesh } from "three";
import { standardCourt as court } from "../court/standard.ts";
import type { CourtFeature } from "../court/features.ts";
import type { FloorPoint, Side, Vec3 } from "../court/types.ts";
import type { ShotType } from "../input/input.ts";
import type { Touch } from "../input/touch.ts";
import type { Motion } from "../player/movement.ts";
import type { TeachingId } from "../rules/teaching.ts";
import type { SimState } from "../sim/world.ts";
import { EXPLANATIONS } from "../teach/content.ts";
import { dismiss, toggle } from "../teach/explain.ts";
import { AnnouncerContext, createAnnouncer, useAnnouncer, type Announcer } from "./announce.ts";
import { Court } from "./Court.tsx";
import type { ExplainStore } from "./explainStore.ts";
import { FpsProbe } from "./Fps.tsx";
import { useHud, type HudStore } from "./hud.ts";
import { ChaseMarkers, Markings } from "./markings.tsx";
import { Player, type PlayerView } from "./Player.tsx";
import type { Chases } from "./playState.ts";
import type { PlayUi } from "./playUi.ts";
import { AssistRings, Ears, FollowCamera, ServeLine } from "./scene.tsx";
import { ExplainPanel, Highlight } from "./teach.tsx";
import { TouchControls, type Extra } from "./TouchControls.tsx";
import { cameraStart, DPR, FPS, inset, panel, srOnly } from "./view.ts";
import { world } from "./world.ts";

export function BallMesh({ ball }: { ball: RefObject<Mesh | null> }) {
  return (
    <mesh ref={ball}>
      <sphereGeometry args={[world.ball.radius, 16, 12]} />
      <meshStandardMaterial color="#f5f0e1" />
    </mesh>
  );
}

/** What the shared scene draws from, made once per screen. */
export interface PlayViews {
  readonly serving: () => boolean;
  readonly player: PlayerView;
  readonly assist: () => { sim: SimState; motion: Motion; end: Side };
  readonly camera: () => { at: FloorPoint; end: Side; ball: Vec3 | null; focus?: Vec3 | null };
}

/**
 * While the frame loop is stopped, draws one frame whenever the scene is
 * re-rendered or resized, e.g. the court markings turned on from the pause
 * menu. Not on the render that stops it: that frame is already drawn.
 */
function StillFrame({ stopped }: { stopped: boolean }) {
  const get = useThree((s) => s.get);
  useThree((s) => s.size);
  const was = useRef(stopped);
  useEffect(() => {
    if (stopped && was.current) {
      const state = get();
      // One frame on from the stopped clock, as the loop would have drawn it.
      advance(state.clock.elapsedTime + 1 / 60, true, state);
    }
    was.current = stopped;
  });
  return null;
}

/** What a game draws on its screen's canvas. */
interface Scene {
  /** Which mount of a `PlayScene`: a new one starts its contents afresh. */
  readonly id: number;
  readonly node: ReactNode;
  readonly stopped: boolean;
}

/** The scene showing on a stage, set by its `PlayScene`. */
function createSlot() {
  let scene: Scene | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of listeners) l();
  };
  return {
    get: () => scene,
    set: (s: Scene) => {
      scene = s;
      emit();
    },
    /** Clears `id`'s scene, unless another has already replaced it. */
    clear: (id: number) => {
      if (scene?.id !== id) return;
      scene = null;
      emit();
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

type Slot = ReturnType<typeof createSlot>;

const SlotContext = createContext<Slot | null>(null);

/** The screen's one polite live region, not shown. */
function LiveRegion({ announcer }: { announcer: Announcer }) {
  const said = useSyncExternalStore(announcer.subscribe, announcer.get);
  return (
    <div aria-live="polite" style={srOnly}>
      {said.map((s) => (
        <div key={s.n}>{s.text}</div>
      ))}
    </div>
  );
}

/**
 * A playing screen's one canvas (212), kept for as long as the screen, so a
 * new lesson or match doesn't make a new WebGL context, recompile every
 * shader and upload the court again. It draws the court and lights; a
 * `PlayScene` among `children` puts the game on it. With no scene, or one
 * stopped, the frame loop stops.
 */
export function PlayStage({ children }: { children: ReactNode }) {
  const [slot] = useState(createSlot);
  const [announcer] = useState(createAnnouncer);
  const scene = useSyncExternalStore(slot.subscribe, slot.get);
  const stopped = scene?.stopped ?? true;
  return (
    <SlotContext value={slot}>
      <Canvas
        dpr={DPR}
        frameloop={stopped ? "never" : "always"}
        camera={{ fov: 55 }}
        role="img"
        aria-label="The court, seen from behind the player"
      >
        <color attach="background" args={["#101418"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 12, -6]} intensity={1.8} />
        <directionalLight position={[-6, 8, 10]} intensity={0.6} />
        <Court court={court} />
        <Ears />
        {FPS && <FpsProbe />}
        {scene && <Fragment key={scene.id}>{scene.node}</Fragment>}
        <StillFrame stopped={stopped} />
      </Canvas>
      <LiveRegion announcer={announcer} />
      <AnnouncerContext value={announcer}>{children}</AnnouncerContext>
    </SlotContext>
  );
}

/** Puts the camera behind the player, as a game starts. */
function CameraStart({ at, end }: { at: FloorPoint; end: Side }) {
  const camera = useThree((s) => s.camera);
  const [from] = useState(() => cameraStart(at, end));
  useLayoutEffect(() => {
    camera.position.set(...from);
    camera.lookAt(0, 0, 0);
  }, [camera, from]);
  return null;
}

let scenes = 0;

/**
 * The player and camera every playing screen draws (210), on the canvas of
 * the `PlayStage` above. `children` are the screen's own: its loop, the
 * opponent, chase markers. Everything here starts afresh with each mount, e.g.
 * a new lesson attempt. While `stopped` (the pause menu or the rules is open),
 * nothing is drawn (212).
 */
export function PlayScene({
  start,
  views,
  feature,
  markings,
  assist,
  stopped,
  children,
}: {
  /** Where the player starts, for the first camera position. */
  start: { readonly at: FloorPoint; readonly end: Side };
  views: PlayViews;
  feature: CourtFeature | null | undefined;
  markings: boolean;
  assist: boolean;
  stopped: boolean;
  children: ReactNode;
}) {
  const slot = use(SlotContext);
  if (!slot) throw new Error("A PlayScene needs a PlayStage");
  const [id] = useState(() => ++scenes);
  const node = (
    <>
      <CameraStart at={start.at} end={start.end} />
      <ServeLine visible={views.serving} />
      <Player view={views.player} />
      {children}
      {feature && <Highlight feature={feature} />}
      {markings && <Markings />}
      <AssistRings view={views.assist} on={assist} />
      <FollowCamera target={views.camera} />
    </>
  );
  useLayoutEffect(() => {
    slot.set({ id, node, stopped });
  });
  useLayoutEffect(
    () => () => {
      slot.clear(id);
    },
    [slot, id],
  );
  return null;
}

/** The chase markers on the floor, from the HUD. */
export const HudChases = memo(function HudChases({ hud }: { hud: HudStore<Chases> }) {
  return <ChaseMarkers chases={useHud(hud, (h) => h.chases)} />;
});

/** The keys, bottom left, on a keyboard screen. */
export function HelpPanel({ lines, children }: { lines: readonly string[]; children?: ReactNode }) {
  return (
    <div
      style={{
        ...panel,
        left: inset("left", 12),
        bottom: inset("bottom", 12),
        fontSize: 12,
        color: "#b8b8b8",
      }}
    >
      {lines.map((h) => (
        <div key={h}>{h}</div>
      ))}
      {children}
    </div>
  );
}

/** The Marker's explanation showing now, if any. */
export function Explanation({
  explain,
  showing,
}: {
  explain: ExplainStore;
  showing: TeachingId | null;
}) {
  const announcer = useAnnouncer();
  // Once per explanation, though Strict Mode runs the effect twice.
  const said = useRef<TeachingId | null>(null);
  useEffect(() => {
    if (showing && showing !== said.current)
      announcer.say("The Marker explains", EXPLANATIONS[showing].title);
    said.current = showing;
  }, [announcer, showing]);
  if (!showing) return null;
  return (
    <ExplainPanel
      id={showing}
      onClose={() => {
        explain.set(dismiss(explain.get()));
      }}
      onOff={() => {
        explain.set(toggle(explain.get()));
      }}
    />
  );
}

/** The touch controls, re-reading the player's choices whenever the HUD's `choice` changes. */
export function PlayTouch({
  hud,
  athlete,
  pad,
  ui,
  extras,
}: {
  hud: HudStore<{ readonly choice: string }>;
  athlete: () => { readonly serve: unknown; readonly serveStyle: number; readonly shot: ShotType };
  pad: Touch;
  ui: PlayUi;
  extras?: readonly Extra[];
}) {
  // The HUD's `choice` describes everything the controls show of the player's choices.
  useHud(hud, (h) => h.choice);
  return (
    <TouchControls
      touch={pad}
      athlete={athlete()}
      extras={extras}
      onPause={() => {
        ui.setMenu(true);
      }}
    />
  );
}

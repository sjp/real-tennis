import { Canvas } from "@react-three/fiber";
import { memo, type ReactNode, type RefObject } from "react";
import type { Mesh } from "three";
import { standardCourt as court } from "../court/standard.ts";
import type { CourtFeature } from "../court/features.ts";
import type { FloorPoint, Side, Vec3 } from "../court/types.ts";
import type { ShotType } from "../input/input.ts";
import type { Touch } from "../input/touch.ts";
import type { Motion } from "../player/movement.ts";
import type { TeachingId } from "../rules/teaching.ts";
import type { SimState } from "../sim/world.ts";
import { dismiss, toggle } from "../teach/explain.ts";
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
import { cameraStart, DPR, FPS, panel } from "./view.ts";
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
 * The court, lights, player and camera every playing screen draws (210).
 * `children` are the screen's own: its loop, the opponent, chase markers.
 */
export function PlayCanvas({
  start,
  views,
  feature,
  markings,
  assist,
  children,
}: {
  /** Where the player starts, for the first camera position. */
  start: { readonly at: FloorPoint; readonly end: Side };
  views: PlayViews;
  feature: CourtFeature | null | undefined;
  markings: boolean;
  assist: boolean;
  children: ReactNode;
}) {
  return (
    <Canvas dpr={DPR} camera={{ position: cameraStart(start.at, start.end), fov: 55 }}>
      <color attach="background" args={["#101418"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 12, -6]} intensity={1.8} />
      <directionalLight position={[-6, 8, 10]} intensity={0.6} />
      <Court court={court} />
      <Ears />
      {FPS && <FpsProbe />}
      <ServeLine visible={views.serving} />
      <Player view={views.player} />
      {children}
      {feature && <Highlight feature={feature} />}
      {markings && <Markings />}
      <AssistRings view={views.assist} on={assist} />
      <FollowCamera target={views.camera} />
    </Canvas>
  );
}

/** The chase markers on the floor, from the HUD. */
export const HudChases = memo(function HudChases({ hud }: { hud: HudStore<Chases> }) {
  return <ChaseMarkers chases={useHud(hud, (h) => h.chases)} />;
});

/** The keys, bottom left, on a keyboard screen. */
export function HelpPanel({ lines, children }: { lines: readonly string[]; children?: ReactNode }) {
  return (
    <div style={{ ...panel, left: 12, bottom: 12, fontSize: 12, color: "#b8b8b8" }}>
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

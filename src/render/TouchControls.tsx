import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { SHOT_TYPES, type ShotType } from "../input/input.ts";
import { STICK_RADIUS, type Stick, type Touch } from "../input/touch.ts";
import { SERVE_STYLES } from "../player/serve.ts";
import { useMedia } from "./media.ts";
import { HIGHLIGHT } from "./view.ts";

const SHOT_NAMES: Record<ShotType, string> = {
  drive: "Drive",
  cut: "Cut",
  lob: "Lob",
  boast: "Boast",
};

const round: CSSProperties = {
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  border: "2px solid rgba(255, 255, 255, 0.5)",
  background: "rgba(0, 0, 0, 0.35)",
  color: "#ffffff",
  font: "bold 14px ui-monospace, monospace",
  userSelect: "none",
  touchAction: "none",
  WebkitUserSelect: "none",
};

const pill: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.4)",
  background: "rgba(0, 0, 0, 0.45)",
  color: "#ffffff",
  font: "12px ui-monospace, monospace",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
};

/** Acts on the finger going down, not on lifting: a click comes too late to swing. */
function Press({
  style,
  onPress,
  onRelease,
  children,
}: {
  style: CSSProperties;
  onPress: () => void;
  onRelease?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      style={style}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
    >
      {children}
    </div>
  );
}

/** The portrait hint, once dismissed, stays away until the page reloads. */
let hintDismissed = false;

export interface Extra {
  readonly label: string;
  readonly onPress: () => void;
}

/**
 * The touch controls (080): a joystick wherever the left thumb lands, and
 * on the right Swing and the shots. While serving, one button cycles
 * the serve styles.
 */
export function TouchControls({
  touch,
  athlete,
  extras = [],
  onPause,
}: {
  touch: Touch;
  /** The player's current choices, read when the screen re-renders. */
  athlete: { readonly serve: unknown; readonly serveStyle: number; readonly shot: ShotType };
  /** More buttons for this screen, e.g. the practice feeds. */
  extras?: readonly Extra[];
  onPause: () => void;
}) {
  const [stick, setStick] = useState<Stick | null>(null);
  const thumb = (e: PointerEvent, f: (id: number, x: number, y: number) => void) => {
    f(e.pointerId, e.clientX, e.clientY);
    setStick(touch.stick());
  };
  const serving = athlete.serve !== null;
  const style = SERVE_STYLES[athlete.serveStyle]!;
  const portrait = useMedia("(orientation: portrait)");
  const [hint, setHint] = useState(!hintDismissed);
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
      {portrait && hint && (
        <Press
          style={{
            ...pill,
            position: "absolute",
            left: "50%",
            top: "40%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "auto",
            fontSize: 14,
            padding: "12px 16px",
            borderColor: HIGHLIGHT,
          }}
          onPress={() => {
            hintDismissed = true;
            setHint(false);
          }}
        >
          Turn your phone sideways for a better view ✕
        </Press>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 64,
          bottom: 0,
          width: "50%",
          pointerEvents: "auto",
          touchAction: "none",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          thumb(e, touch.stickStart);
        }}
        onPointerMove={(e) => {
          thumb(e, touch.stickMove);
        }}
        onPointerUp={(e) => {
          thumb(e, touch.stickEnd);
        }}
        onPointerCancel={(e) => {
          thumb(e, touch.stickEnd);
        }}
      >
        {stick ? (
          <Joystick stick={stick} />
        ) : (
          <div
            style={{
              position: "absolute",
              left: 24,
              bottom: 24,
              color: "rgba(255, 255, 255, 0.5)",
              font: "12px ui-monospace, monospace",
            }}
          >
            Touch here to move
          </div>
        )}
      </div>
      <div style={{ pointerEvents: "auto" }}>
        <Press
          style={{ ...round, right: 24, bottom: 24, width: 96, height: 96, fontSize: 16 }}
          onPress={() => {
            touch.swing();
          }}
        >
          {serving ? "Toss / Swing" : "Swing"}
        </Press>
        <div
          style={{
            position: "absolute",
            right: 24,
            bottom: 136,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            maxWidth: "45vw",
          }}
        >
          {serving ? (
            <Press
              style={{ ...pill, borderColor: HIGHLIGHT }}
              onPress={() => {
                touch.select(((athlete.serveStyle + 1) % SERVE_STYLES.length) + 1);
              }}
            >
              Serve: {style.name} ▸
            </Press>
          ) : (
            SHOT_TYPES.map((shot, i) => (
              <Press
                key={shot}
                style={{
                  ...pill,
                  borderColor: shot === athlete.shot ? HIGHLIGHT : (pill.border as string),
                  color: shot === athlete.shot ? HIGHLIGHT : "#ffffff",
                }}
                onPress={() => {
                  touch.select(i + 1);
                }}
              >
                {SHOT_NAMES[shot]}
              </Press>
            ))
          )}
        </div>
        <div
          style={{
            position: "absolute",
            right: 12,
            top: 12,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            maxWidth: "50vw",
          }}
        >
          {extras.map((x) => (
            <Press key={x.label} style={pill} onPress={x.onPress}>
              {x.label}
            </Press>
          ))}
          <Press style={{ ...pill, fontSize: 16, padding: "4px 12px" }} onPress={onPause}>
            ❚❚
          </Press>
        </div>
      </div>
    </div>
  );
}

function Joystick({ stick }: { stick: Stick }) {
  const dx = stick.at.x - stick.origin.x;
  const dy = stick.at.y - stick.origin.y;
  const d = Math.hypot(dx, dy);
  // The knob stops at the rim.
  const k = d > STICK_RADIUS ? STICK_RADIUS / d : 1;
  const base = STICK_RADIUS * 2;
  return (
    <>
      <div
        style={{
          ...round,
          left: stick.origin.x - STICK_RADIUS,
          top: stick.origin.y - STICK_RADIUS - 64,
          width: base,
          height: base,
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          ...round,
          left: stick.origin.x + dx * k - 24,
          top: stick.origin.y + dy * k - 24 - 64,
          width: 48,
          height: 48,
          boxSizing: "border-box",
          background: "rgba(255, 255, 255, 0.35)",
        }}
      />
    </>
  );
}

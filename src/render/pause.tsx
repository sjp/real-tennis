import { toggle } from "../teach/explain.ts";
import { useExplainer, type ExplainStore } from "./explainStore.ts";
import type { PlayUi } from "./playUi.ts";
import { Rules } from "./Rules.tsx";
import { settings, useSettings } from "./settings.ts";
import { centred, HIGHLIGHT } from "./view.ts";
import { TouchSetting } from "./TouchSetting.tsx";
import { Volume } from "./Volume.tsx";

const canFullscreen = () => document.fullscreenEnabled;

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void document.documentElement
    .requestFullscreen()
    // Phones play best sideways; browsers that can't lock just say no.
    .then(() => (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.("landscape"))
    .catch(() => {});
}

const onOff = (on: boolean) => (on ? "on" : "off");

/** The pause menu while open, and the rules over it. */
export function PauseMenu({
  ui,
  explain,
  leave,
  onLeave,
}: {
  ui: PlayUi;
  explain: ExplainStore;
  /** What leaving does, e.g. "Leave the match". */
  leave: string;
  onLeave: () => void;
}) {
  const ex = useExplainer(explain);
  const s = useSettings();
  const button = { minWidth: 220, textAlign: "left", padding: "6px 10px" } as const;
  return (
    <>
      {ui.menu && (
        <div
          style={{
            ...centred,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "16px 20px",
            border: `1px solid ${HIGHLIGHT}`,
          }}
        >
          <div style={{ fontSize: 18, color: "#ffffff", marginBottom: 4 }}>Paused</div>
          <button
            style={button}
            onClick={() => {
              ui.setMenu(false);
            }}
          >
            Resume (Esc)
          </button>
          <button
            style={button}
            onClick={() => {
              ui.setRules(true);
            }}
          >
            Rules (?)
          </button>
          <button style={button} onClick={ui.toggleMarkings}>
            Court markings: {onOff(ui.markings)} (M)
          </button>
          <button
            style={button}
            onClick={() => {
              explain.set(toggle(explain.get()));
            }}
          >
            Explanations: {onOff(ex.on)} (X)
          </button>
          <button
            style={button}
            onClick={() => {
              settings.set({ assist: !s.assist });
            }}
          >
            Hit assist: {onOff(s.assist)} (H)
          </button>
          <Volume />
          <TouchSetting />
          {canFullscreen() && (
            <button style={button} onClick={toggleFullscreen}>
              Fullscreen
            </button>
          )}
          <button style={{ ...button, marginTop: 6 }} onClick={onLeave}>
            {leave}
          </button>
        </div>
      )}
      {ui.rules && (
        <Rules
          onClose={() => {
            ui.setRules(false);
          }}
        />
      )}
    </>
  );
}

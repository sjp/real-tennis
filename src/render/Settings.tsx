import { useState, type ReactNode } from "react";
import { reset, toggle } from "../teach/explain.ts";
import { createExplainStore, useExplainer } from "./explainStore.ts";
import { loadDone, saveDone } from "./progress.ts";
import { settings, useSettings } from "./settings.ts";
import { HIGHLIGHT, page } from "./view.ts";
import { TouchSetting } from "./TouchSetting.tsx";
import { Volume } from "./Volume.tsx";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "10px 0" }}>
      <span style={{ minWidth: 150 }}>{label}</span>
      {children}
    </div>
  );
}

/** Every setting, at `?settings`. */
export function Settings() {
  const s = useSettings();
  const [explain] = useState(createExplainStore);
  const ex = useExplainer(explain);
  const [lessons, setLessons] = useState(() => loadDone().length);
  return (
    <div style={page}>
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: 16,
          color: "#e8e8e8",
          font: "14px/1.6 ui-monospace, monospace",
        }}
      >
        <div style={{ fontSize: 20, color: "#ffffff" }}>Settings</div>
        <Row label="Sound">
          <Volume />
        </Row>
        <Row label="Controls">
          <TouchSetting />
        </Row>
        <Row label="Hit assist">
          <button
            onClick={() => {
              settings.set({ assist: !s.assist });
            }}
          >
            {s.assist ? "On" : "Off"}
          </button>
          <span style={{ color: "#888" }}>
            Rings where the ball will bounce and where to meet it
          </span>
        </Row>
        <Row label="Auto-hit">
          <button
            onClick={() => {
              settings.set({ autoHit: !s.autoHit });
            }}
          >
            {s.autoHit ? "On" : "Off"}
          </button>
          <span style={{ color: "#888" }}>Hit rally balls automatically when you reach them</span>
        </Row>
        <Row label="Explanations">
          <button
            onClick={() => {
              explain.set(toggle(ex));
            }}
          >
            {ex.on ? "On" : "Off"}
          </button>
          <button
            disabled={ex.seen.length === 0}
            onClick={() => {
              explain.set(reset(ex));
            }}
          >
            {ex.seen.length === 0 ? "Nothing explained yet" : "Explain everything again"}
          </button>
        </Row>
        <Row label="Lessons">
          <button
            disabled={lessons === 0}
            onClick={() => {
              saveDone([]);
              setLessons(0);
            }}
          >
            {lessons === 0 ? "None completed" : `Clear ${String(lessons)} completed`}
          </button>
        </Row>
        <p style={{ marginTop: 16 }}>
          <a href="?" style={{ color: HIGHLIGHT }}>
            Back to the menu
          </a>
        </p>
      </div>
    </div>
  );
}

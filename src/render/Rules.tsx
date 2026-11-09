import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import { featureShape } from "../court/features.ts";
import { standardCourt as court } from "../court/standard.ts";
import { ENTRIES, TOPICS, type Entry } from "../teach/reference.ts";
import { Court } from "./Court.tsx";
import { useMedia } from "./media.ts";
import { Highlight } from "./teach.tsx";
import { DPR, HIGHLIGHT } from "./view.ts";

const POINTS: readonly [string, string][] = [
  ["No points", "Love"],
  ["1 point", "Fifteen"],
  ["2 points", "Thirty"],
  ["3 points", "Forty"],
  ["4 points, opponent on thirty or less", "Game"],
  ["Three points each", "Deuce (forty-all)"],
  ["One point ahead from deuce", "Advantage"],
  ["Two points ahead from deuce", "Game"],
];

/** A small 3D court with the entry's feature lit up; drag to look around. */
function CourtView({ entry }: { entry: Entry }) {
  const shape = featureShape(court, entry.feature!);
  const at = shape.label;
  const n = shape.polygons[0]!.normal;
  // Floors and roofs from above; walls and openings from in front, below the penthouses.
  const from: [number, number, number] =
    Math.abs(n.y) > 0.7
      ? [-12, 12, at.z - 9]
      : [at.x + n.x * 8, Math.max(1.6, at.y + 0.5), at.z + n.z * 8 - 2 * Math.abs(n.x)];
  return (
    <div style={{ height: "min(320px, 60vh)", borderRadius: 6, overflow: "hidden", marginTop: 12 }}>
      <Canvas key={entry.id} dpr={DPR} camera={{ position: from, fov: 50 }}>
        <color attach="background" args={["#101418"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 12, -6]} intensity={1.6} />
        <Court court={court} />
        <Highlight feature={entry.feature!} />
        <OrbitControls target={[at.x, at.y, at.z]} />
      </Canvas>
    </div>
  );
}

function PointsDiagram() {
  return (
    <table style={{ marginTop: 12, borderCollapse: "collapse" }}>
      <tbody>
        {POINTS.map(([won, call]) => (
          <tr key={won + call}>
            <td style={{ padding: "4px 16px 4px 0", color: "#b8b8b8" }}>{won}</td>
            <td style={{ padding: "4px 0", color: "#ffffff" }}>{call}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The rules reference (070): entries by topic, each with a 3D view of the
 * court or a diagram. `onClose` shows a close button, for use in play.
 */
export function Rules({ onClose }: { onClose?: () => void }) {
  const [id, setId] = useState(ENTRIES[0]!.id);
  const entry = ENTRIES.find((e) => e.id === id)!;
  // On a narrow screen the list of entries is a dropdown above the entry.
  const narrow = useMedia("(max-width: 640px)");
  const back = onClose ? (
    // Opened in play: focus starts here, so Enter goes back (213).
    <button autoFocus onClick={onClose} style={{ marginBottom: 8 }}>
      Back to the game (Esc)
    </button>
  ) : (
    <a href="?" style={{ color: HIGHLIGHT }}>
      Back to the menu
    </a>
  );
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexWrap: "wrap",
        alignContent: "flex-start",
        overflow: "auto",
        background: "#101418",
        color: "#e8e8e8",
        font: "14px/1.6 ui-monospace, monospace",
      }}
    >
      {narrow ? (
        <nav style={{ flex: "1 1 100%", padding: "16px 16px 0" }}>
          <div style={{ fontSize: 18, color: "#ffffff", marginBottom: 8 }}>
            Rules of real tennis
          </div>
          {back}
          <select
            value={id}
            onChange={(e) => {
              setId(e.target.value);
            }}
            style={{ display: "block", marginTop: 8, maxWidth: "100%" }}
          >
            {TOPICS.map((t) => (
              <optgroup key={t.id} label={t.name}>
                {ENTRIES.filter((e) => e.topic === t.id).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </nav>
      ) : (
        <nav style={{ flex: "0 0 240px", padding: 16, borderRight: "1px solid #2a2f36" }}>
          <div style={{ fontSize: 18, color: "#ffffff", marginBottom: 8 }}>
            Rules of real tennis
          </div>
          {back}
          {TOPICS.map((t) => (
            <div key={t.id} style={{ marginTop: 10 }}>
              <div style={{ color: "#888", fontSize: 12, textTransform: "uppercase" }}>
                {t.name}
              </div>
              {ENTRIES.filter((e) => e.topic === t.id).map((e) => (
                <div key={e.id}>
                  <button
                    onClick={() => {
                      setId(e.id);
                    }}
                    aria-current={e.id === id ? "true" : undefined}
                    style={{
                      // A plain link-like button, keeping its focus ring (213).
                      padding: 0,
                      border: 0,
                      background: "none",
                      font: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                      color: e.id === id ? HIGHLIGHT : "#e8e8e8",
                    }}
                  >
                    {e.title}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </nav>
      )}
      <main style={{ flex: "1 1 360px", padding: 16, maxWidth: 760 }}>
        <h2 style={{ margin: "0 0 8px", color: "#ffffff" }}>{entry.title}</h2>
        {entry.paragraphs.map((p) => (
          <p key={p} style={{ margin: "0 0 8px" }}>
            {p}
          </p>
        ))}
        <div style={{ color: "#888", fontSize: 12 }}>
          Laws {entry.laws}. Paraphrased from the T&RA Laws of Tennis; see the T&RA for the full
          text.
        </div>
        {entry.feature && <CourtView entry={entry} />}
        {entry.diagram === "points" && <PointsDiagram />}
      </main>
    </div>
  );
}

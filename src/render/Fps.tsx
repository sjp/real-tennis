import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { panel } from "./view.ts";

/** What the renderer did last frame, for the meter. */
const stats = { calls: 0, triangles: 0, frames: 0, dpr: 1 };

/** Inside the canvas: counts frames and draw calls. */
export function FpsProbe() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    stats.frames++;
    stats.calls = gl.info.render.calls;
    stats.triangles = gl.info.render.triangles;
    stats.dpr = gl.getPixelRatio();
  });
  return null;
}

/** Frames per second and draw calls, once a second. Shown with `?fps`. */
export function FpsMeter() {
  const [text, setText] = useState("");
  useEffect(() => {
    let last = performance.now();
    let frames = stats.frames;
    const id = setInterval(() => {
      const now = performance.now();
      const fps = ((stats.frames - frames) * 1000) / (now - last);
      setText(
        `${fps.toFixed(0)} fps · ${stats.calls} draws · ${(stats.triangles / 1000).toFixed(1)}k tris · pixel ratio ${stats.dpr} of ${devicePixelRatio}`,
      );
      last = now;
      frames = stats.frames;
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ ...panel, left: "50%", bottom: 8, transform: "translateX(-50%)", fontSize: 11 }}>
      {text}
    </div>
  );
}

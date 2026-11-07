import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import { CanvasTexture, DoubleSide, SRGBColorSpace, type MeshBasicMaterial } from "three";
import { featureName, featureShape, type CourtFeature } from "../court/features.ts";
import { standardCourt as court } from "../court/standard.ts";
import { TEACHING, type TeachingId } from "../rules/teaching.ts";
import { EXPLANATIONS } from "../teach/content.ts";
import { word } from "../teach/wording.ts";
import { useTouchShown } from "./inputMode.ts";
import { polygonGeometry } from "./geometry.ts";
import { HIGHLIGHT, panel } from "./view.ts";

/** A court feature, glowing, with its name. */
export const Highlight = memo(function Highlight({
  feature,
  colour = HIGHLIGHT,
  pulse = true,
  label = true,
}: {
  feature: CourtFeature;
  colour?: string;
  pulse?: boolean;
  label?: boolean;
}) {
  const shape = useMemo(() => featureShape(court, feature), [feature]);
  const geometry = useMemo(() => polygonGeometry(shape.polygons), [shape]);
  const material = useRef<MeshBasicMaterial>(null);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  useFrame(({ clock }) => {
    if (material.current && pulse)
      material.current.opacity = 0.35 + 0.25 * Math.sin(clock.elapsedTime * 4);
  });
  const { x, y, z } = shape.label;
  return (
    <group>
      <mesh geometry={geometry} renderOrder={1}>
        <meshBasicMaterial
          ref={material}
          color={colour}
          transparent
          opacity={0.45}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {label && (
        <Label text={featureName(court, feature)} position={[x, y + 0.3, z]} colour={colour} />
      )}
    </group>
  );
});

/** Text that always faces the camera, at a fixed size on screen, and shows through walls. */
export function Label({
  text,
  position,
  colour = HIGHLIGHT,
  size = 0.035,
}: {
  text: string;
  position: [number, number, number];
  colour?: string;
  /** Label height, as a fraction of the view's height. */
  size?: number;
}) {
  const texture = useMemo(() => labelTexture(text, colour), [text, colour]);
  useEffect(
    () => () => {
      texture.dispose();
    },
    [texture],
  );
  const { width, height } = texture.image;
  return (
    <sprite position={position} scale={[(size * width) / height, size, 1]} renderOrder={2}>
      <spriteMaterial map={texture} depthTest={false} transparent sizeAttenuation={false} />
    </sprite>
  );
}

function labelTexture(text: string, colour: string): CanvasTexture {
  const px = 48;
  const font = `${String(px)}px ui-monospace, monospace`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + px;
  canvas.height = Math.round(px * 1.6);
  ctx.font = font;
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.beginPath();
  ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, px / 3);
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#e8e8e8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The Marker explaining a call for the first time; play waits for it. */
export function ExplainPanel({
  id,
  onClose,
  onOff,
}: {
  id: TeachingId;
  onClose: () => void;
  onOff: () => void;
}) {
  const e = EXPLANATIONS[id];
  const touch = useTouchShown();
  useEffect(() => {
    const down = (k: KeyboardEvent) => {
      if (k.code === "Space" || k.code === "Enter") {
        k.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("keydown", down);
    };
  }, [onClose]);
  return (
    <div
      style={{
        ...panel,
        right: 12,
        top: 12,
        maxWidth: "min(380px, calc(100vw - 24px))",
        maxHeight: "calc(100vh - 24px)",
        overflow: "auto",
        boxSizing: "border-box",
        padding: "12px 16px",
        border: `1px solid ${HIGHLIGHT}`,
      }}
    >
      <div style={{ color: "#888", fontSize: 11 }}>THE MARKER EXPLAINS</div>
      <div style={{ color: "#ffffff", fontSize: 16, fontWeight: "bold", margin: "4px 0" }}>
        {e.title}
      </div>
      <div>{e.text}</div>
      {e.tip && (
        <div style={{ color: "#ffd166", marginTop: 6 }}>
          {word(e.tip, touch ? "touch" : "keys")}
        </div>
      )}
      <div style={{ color: "#888", fontSize: 12, marginTop: 6 }}>Law {TEACHING[id].law}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={onClose}>{touch ? "Continue" : "Continue (Space)"}</button>
        <button onClick={onOff}>{touch ? "Stop explaining" : "Stop explaining (X)"}</button>
      </div>
    </div>
  );
}

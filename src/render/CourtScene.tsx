import { OrbitControls } from "@react-three/drei";
import { standardCourt } from "../court/standard.ts";
import { Court } from "./Court.tsx";

export function CourtScene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 12, -6]} intensity={1.8} />
      <directionalLight position={[-6, 8, 10]} intensity={0.6} />
      <Court court={standardCourt} />
      {/* Free debug camera (`?orbit`). */}
      <OrbitControls target={[0, 1, 0]} />
    </>
  );
}

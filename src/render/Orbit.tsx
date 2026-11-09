import { Canvas } from "@react-three/fiber";
import { CourtScene } from "./CourtScene.tsx";

/** A free-orbit view of the empty court (`?orbit`). */
export function Orbit() {
  return (
    <Canvas camera={{ position: [-3, 7, -20], fov: 50 }}>
      <color attach="background" args={["#101418"]} />
      <CourtScene />
    </Canvas>
  );
}

import { Canvas } from "@react-three/fiber";
import { CourtScene } from "./render/CourtScene.tsx";

export default function App() {
  return (
    <Canvas camera={{ position: [-3, 7, -20], fov: 50 }}>
      <color attach="background" args={["#101418"]} />
      <CourtScene />
    </Canvas>
  );
}

import { Canvas } from "@react-three/fiber";
import { CourtScene } from "./render/CourtScene.tsx";
import { Sandbox } from "./render/Sandbox.tsx";

export default function App() {
  if (new URLSearchParams(location.search).has("sandbox")) return <Sandbox />;
  return (
    <Canvas camera={{ position: [-3, 7, -20], fov: 50 }}>
      <color attach="background" args={["#101418"]} />
      <CourtScene />
    </Canvas>
  );
}

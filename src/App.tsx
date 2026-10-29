import { Canvas } from "@react-three/fiber";
import { CourtScene } from "./render/CourtScene.tsx";
import { Practice } from "./render/Practice.tsx";
import { Sandbox } from "./render/Sandbox.tsx";

export default function App() {
  const params = new URLSearchParams(location.search);
  if (params.has("sandbox")) return <Sandbox />;
  if (params.has("orbit"))
    return (
      <Canvas camera={{ position: [-3, 7, -20], fov: 50 }}>
        <color attach="background" args={["#101418"]} />
        <CourtScene />
      </Canvas>
    );
  return <Practice />;
}

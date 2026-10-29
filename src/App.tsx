import { Canvas } from "@react-three/fiber";
import { CourtScene } from "./render/CourtScene.tsx";
import { Learn } from "./render/Learn.tsx";
import { Match } from "./render/Match.tsx";
import { Menu } from "./render/Menu.tsx";
import { Practice } from "./render/Practice.tsx";
import { Rules } from "./render/Rules.tsx";
import { Sandbox } from "./render/Sandbox.tsx";

export default function App() {
  const params = new URLSearchParams(location.search);
  if (params.has("sandbox")) return <Sandbox />;
  if (params.has("match")) return <Match />;
  if (params.has("rules")) return <Rules />;
  if (params.has("learn")) return <Learn />;
  if (params.has("orbit"))
    return (
      <Canvas camera={{ position: [-3, 7, -20], fov: 50 }}>
        <color attach="background" args={["#101418"]} />
        <CourtScene />
      </Canvas>
    );
  if (params.has("practice")) return <Practice />;
  return <Menu />;
}

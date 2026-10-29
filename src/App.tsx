import { Canvas } from "@react-three/fiber";
import { PlaceholderScene } from "./render/PlaceholderScene.tsx";

export default function App() {
  return (
    <Canvas camera={{ position: [8, 6, 8], fov: 50 }}>
      <PlaceholderScene />
    </Canvas>
  );
}

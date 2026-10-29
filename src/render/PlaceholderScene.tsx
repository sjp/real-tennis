import { OrbitControls } from "@react-three/drei";

export function PlaceholderScene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial color="#6b8e5a" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry />
        <meshStandardMaterial color="#d9d4c7" />
      </mesh>
      <OrbitControls />
    </>
  );
}

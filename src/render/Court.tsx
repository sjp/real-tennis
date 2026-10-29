import { useMemo } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import { polygonGeometry } from "./geometry.ts";
import { serviceLineZ, faultLineX } from "../court/classify.ts";
import { collisionGeometry, netHeightAt, type SurfaceId } from "../court/collision.ts";
import type { CourtDefinition, Vec3 } from "../court/types.ts";

const WALL = "#1c1c1c";
const ROOF = "#8c8c8c";
const LINE = "#f2f2f2";

function surfaceColour(s: SurfaceId): string {
  if (s === "floor") return "#7a2a22";
  if (s === "outOfCourt") return "#3a3a3a";
  if (s.startsWith("penthouse:") || s.startsWith("bandeau:")) return ROOF;
  if (s.startsWith("post:") || s === "netPost") return "#5a4632";
  return WALL;
}

function netGeometry(court: CourtDefinition) {
  const hw = court.floor.width / 2;
  const steps = 32;
  const pos: number[] = [];
  for (let i = 0; i < steps; i++) {
    const xa = -hw + (2 * hw * i) / steps;
    const xb = -hw + (2 * hw * (i + 1)) / steps;
    const ya = netHeightAt(court, xa);
    const yb = netHeightAt(court, xb);
    pos.push(xa, 0, 0, xb, 0, 0, xb, yb, 0, xa, 0, 0, xb, yb, 0, xa, ya, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

interface Stripe {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

function floorLines(court: CourtDefinition): Stripe[] {
  const hw = court.floor.width / 2;
  const hl = court.floor.length / 2;
  const half = court.lineWidth / 2;
  const across = (z: number): Stripe => ({ x0: -hw, x1: hw, z0: z - half, z1: z + half });
  const lineZ = serviceLineZ(court);
  const fx = faultLineX(court);
  return [
    ...court.chaseLines.map((l) =>
      across(l.side === "service" ? -hl + l.distance : lineZ - l.distance),
    ),
    across(lineZ),
    { x0: fx - half, x1: fx + half, z0: lineZ, z1: hl },
  ];
}

export function Court({ court }: { court: CourtDefinition }) {
  const { surfaces, sensors, net, lines } = useMemo(() => {
    const prims = collisionGeometry(court);
    const bySurface = new Map<string, { vertices: readonly Vec3[]; normal: Vec3 }[]>();
    const sensors: { vertices: readonly Vec3[]; normal: Vec3 }[] = [];
    for (const p of prims) {
      if (p.kind === "opening") sensors.push(p);
      if (p.kind !== "polygon") continue;
      // The ceiling would hide the court from the debug camera.
      if (p.surface === "outOfCourt" && p.normal.y < 0) continue;
      const colour = surfaceColour(p.surface);
      bySurface.set(colour, [...(bySurface.get(colour) ?? []), p]);
    }
    return {
      surfaces: [...bySurface].map(([colour, polys]) => ({
        colour,
        geometry: polygonGeometry(polys),
      })),
      sensors: polygonGeometry(sensors),
      net: netGeometry(court),
      lines: polygonGeometry(
        floorLines(court).map((s) => ({
          vertices: [
            { x: s.x0, y: 0.002, z: s.z0 },
            { x: s.x1, y: 0.002, z: s.z0 },
            { x: s.x1, y: 0.002, z: s.z1 },
            { x: s.x0, y: 0.002, z: s.z1 },
          ],
          normal: { x: 0, y: 1, z: 0 },
        })),
      ),
    };
  }, [court]);

  return (
    <group>
      {surfaces.map(({ colour, geometry }) => (
        <mesh key={colour} geometry={geometry}>
          <meshStandardMaterial color={colour} roughness={0.9} />
        </mesh>
      ))}
      <mesh geometry={lines}>
        <meshStandardMaterial color={LINE} />
      </mesh>
      <mesh geometry={sensors}>
        <meshStandardMaterial color="#d8d8d8" transparent opacity={0.25} side={DoubleSide} />
      </mesh>
      <mesh geometry={net}>
        <meshStandardMaterial color="#e8e8e8" transparent opacity={0.6} side={DoubleSide} />
      </mesh>
    </group>
  );
}

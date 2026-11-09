import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { polygonGeometry } from "./geometry.ts";

/** Each triangle's face normal, from its winding. */
function faceNormals(g: ReturnType<typeof polygonGeometry>): Vector3[] {
  const p = g.getAttribute("position");
  const out: Vector3[] = [];
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(p, i + k));
    out.push(b!.sub(a!).cross(c!.sub(a!)).normalize());
  }
  return out;
}

const square = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 1, y: 0, z: 1 },
  { x: 0, y: 0, z: 1 },
];

describe("polygonGeometry", () => {
  it("fans each polygon into triangles wound to face its normal, either way round", () => {
    for (const vertices of [square, [...square].reverse()]) {
      for (const ny of [1, -1]) {
        const g = polygonGeometry([{ vertices, normal: { x: 0, y: ny, z: 0 } }]);
        expect(g.getAttribute("position").count).toBe(6);
        for (const n of faceNormals(g)) expect(n.y).toBeCloseTo(ny);
        const normals = g.getAttribute("normal");
        for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBe(ny);
      }
    }
  });

  it("joins several polygons, and skips ones with too few vertices", () => {
    const wall = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 1 },
      ],
      normal: { x: -1, y: 0, z: 0 },
    };
    const g = polygonGeometry([
      { vertices: square, normal: { x: 0, y: 1, z: 0 } },
      wall,
      { vertices: square.slice(0, 2), normal: { x: 0, y: 1, z: 0 } },
    ]);
    const n = faceNormals(g);
    expect(n).toHaveLength(3);
    expect(n[2]!.x).toBeCloseTo(-1);
  });
});

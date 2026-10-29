import { BufferGeometry, Float32BufferAttribute } from "three";
import type { Vec3 } from "../court/types.ts";

/** Triangulates convex polygons into one geometry, wound to face their normals. */
export function polygonGeometry(polys: readonly { vertices: readonly Vec3[]; normal: Vec3 }[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const { vertices: vs, normal: n } of polys) {
    for (let i = 1; i < vs.length - 1; i++) {
      let [a, b, c] = [vs[0]!, vs[i]!, vs[i + 1]!];
      const cross = {
        x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
        y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
        z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
      };
      if (cross.x * n.x + cross.y * n.y + cross.z * n.z < 0) [b, c] = [c, b];
      for (const p of [a, b, c]) {
        pos.push(p.x, p.y, p.z);
        nor.push(n.x, n.y, n.z);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  return g;
}

import type { GravityVector } from '../app/gravity';

/** Conservative static support: the centre of mass must lie strictly inside actual floor contacts. */
export function supportedByFloor(
  points: readonly number[],
  origin: GravityVector,
  centre: GravityVector,
): boolean {
  const unique = new Map<string, { x: number; z: number }>();
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i]! + origin.x,
      y = points[i + 1]! + origin.y,
      z = points[i + 2]! + origin.z;
    if (Math.abs(y) < 0.00001 && Math.abs(x) < 0.5 && Math.abs(z) < 0.5)
      unique.set(`${x.toFixed(6)},${z.toFixed(6)}`, { x, z });
  }
  const vertices = [...unique.values()].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (a: (typeof vertices)[number], b: typeof a, c: typeof a) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const half = (list: typeof vertices) => {
    const hull: typeof vertices = [];
    for (const p of list) {
      while (hull.length >= 2 && cross(hull.at(-2)!, hull.at(-1)!, p) <= 0) hull.pop();
      hull.push(p);
    }
    return hull;
  };
  if (vertices.length < 3) return false;
  const hull = [...half(vertices).slice(0, -1), ...half([...vertices].reverse()).slice(0, -1)];
  if (hull.length < 3) return false;
  return hull.every((a, i) => {
    const b = hull[(i + 1) % hull.length]!;
    return cross(a, b, centre) > Math.hypot(b.x - a.x, b.z - a.z) * 0.0002;
  });
}

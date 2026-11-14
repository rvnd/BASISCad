import type { GravityShape, GravityVector } from '../app/gravity';

export const COLLIDER_CELL_MM = 0.8;
const MAX_CELLS = 250_000;
const MAX_TRIANGLES = 100_000;
const PLA_DENSITY_KG_M3 = 1240;
const STEEL_DENSITY_KG_M3 = 7850;
/** Approximate two 0.4mm perimeters and 0.8mm skins; core uses the frozen 15% infill. */
import { MATERIAL_INFILL_PERCENT } from '../app/constants';
export interface GravityBox {
  centerMm: GravityVector;
  halfMm: GravityVector;
  density: number;
}
export interface CollisionModel {
  boxes: readonly GravityBox[];
  massGrams: number;
}

/** Scan triangle intersections along Y, then merge occupied cells into solid cuboids.
 * The grid covers the exact exterior bounds. It keeps bores/concavities rather than a hull.
 * Preparation runs once per shape in the physics worker, never during pointer handling.
 */
export function gravityCollisionModel(shape: GravityShape): CollisionModel {
  const p = shape.positionsMm;
  if (!p.length || p.length % 9 || p.length / 9 > MAX_TRIANGLES || !p.every(Number.isFinite))
    throw new Error(
      `${shape.name}: gravity needs a finite triangle mesh with at most ${MAX_TRIANGLES} triangles.`,
    );
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  const edges = new Map<string, number>();
  for (let i = 0; i < p.length; i += 9) {
    const vertices = [0, 3, 6].map((offset) =>
      [0, 1, 2].map((axis) => String(Math.round(p[i + offset + axis]! * 1e5))).join(','),
    );
    if (new Set(vertices).size < 3) continue;
    for (let k = 0; k < 3; k++) {
      const key = [vertices[k]!, vertices[(k + 1) % 3]!].sort().join('|');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  if ([...edges.values()].some((count) => count !== 2))
    throw new Error(
      `${shape.name}: gravity needs a closed, manifold mesh. Repair the imported surface before testing.`,
    );
  for (let i = 0; i < p.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis]!, p[i]!);
    max[axis] = Math.max(max[axis]!, p[i]!);
  }
  const size = max.map((v, i) => v - min[i]!);
  if (size.some((v) => v < 0.01))
    throw new Error(`${shape.name}: gravity needs a three-dimensional solid, not a flat surface.`);
  const [nx, ny, nz] = size.map((v) => Math.ceil(v / COLLIDER_CELL_MM)) as [number, number, number];
  if (nx * ny * nz > MAX_CELLS)
    throw new Error(
      `${shape.name}: simplify this mesh before testing gravity; it exceeds the collision preparation limit.`,
    );
  const [dx, dy, dz] = size.map((v, i) => v / [nx, ny, nz][i]!) as [number, number, number];
  const rays = Array.from({ length: nx * nz }, () => [] as number[]);
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i]!,
      ay = p[i + 1]!,
      az = p[i + 2]!;
    const bx = p[i + 3]!,
      by = p[i + 4]!,
      bz = p[i + 5]!;
    const cx = p[i + 6]!,
      cy = p[i + 7]!,
      cz = p[i + 8]!;
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) < 1e-10) continue;
    const x0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - min[0]!) / dx - 0.5));
    const x1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - min[0]!) / dx - 0.5));
    const z0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - min[2]!) / dz - 0.5));
    const z1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - min[2]!) / dz - 0.5));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const px = min[0]! + (x + 0.5) * dx,
          pz = min[2]! + (z + 0.5) * dz;
        const a = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / denominator;
        const b = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / denominator;
        const c = 1 - a - b;
        if (Math.min(a, b, c) >= -1e-8) rays[x + nx * z]!.push(a * ay + b * by + c * cy);
      }
  }
  const cells = new Uint8Array(nx * ny * nz);
  const index = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  let occupied = 0;
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const hits = rays[x + nx * z]!.sort((a, b) => a - b).filter(
        (v, i, a) => !i || v - a[i - 1]! > 1e-5,
      );
      if (hits.length % 2)
        throw new Error(
          `${shape.name}: this mesh has an open or inconsistent surface and cannot be used for gravity.`,
        );
      for (let j = 0; j < hits.length; j += 2)
        for (let y = 0; y < ny; y++) {
          const py = min[1]! + (y + 0.5) * dy;
          if (py > hits[j]! && py < hits[j + 1]!) {
            cells[index(x, y, z)] = 1;
            occupied++;
          }
        }
    }
  if (!occupied) throw new Error(`${shape.name}: no solid volume was found for gravity.`);
  // A cell next to an exterior face estimates the printed wall/skin. The core is sparse.
  const filled = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && cells[index(x, y, z)]! > 0;
  if (!shape.steel)
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          if (
            filled(x, y, z) &&
            filled(x - 1, y, z) &&
            filled(x + 1, y, z) &&
            filled(x, y - 1, z) &&
            filled(x, y + 1, z) &&
            filled(x, y, z - 1) &&
            filled(x, y, z + 1)
          )
            cells[index(x, y, z)] = 2;
        }
  const materialCells = cells.reduce(
    (sum, type) => sum + (type === 2 ? MATERIAL_INFILL_PERCENT / 100 : type ? 1 : 0),
    0,
  );
  const density = shape.steel
    ? STEEL_DENSITY_KG_M3
    : (PLA_DENSITY_KG_M3 * materialCells) / occupied;
  // Collision geometry is independent of material density; merging across the skin/core
  // avoids thousands of redundant contacting faces. Mass distribution is uniform per part.
  for (let i = 0; i < cells.length; i++) if (cells[i]) cells[i] = 1;
  const boxes: GravityBox[] = [];
  let massGrams = 0;
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const type = cells[index(x, y, z)]!;
        if (!type) continue;
        let xx = x + 1,
          yy = y + 1,
          zz = z + 1;
        while (xx < nx && cells[index(xx, y, z)] === type) xx++;
        while (
          yy < ny &&
          Array.from({ length: xx - x }, (_, i) => cells[index(x + i, yy, z)] === type).every(
            Boolean,
          )
        )
          yy++;
        const layerMatches = (next: number) => {
          for (let b = y; b < yy; b++)
            for (let a = x; a < xx; a++) if (cells[index(a, b, next)] !== type) return false;
          return true;
        };
        while (zz < nz && layerMatches(zz)) zz++;
        for (let c = z; c < zz; c++)
          for (let b = y; b < yy; b++) for (let a = x; a < xx; a++) cells[index(a, b, c)] = 0;
        const halfMm = { x: ((xx - x) * dx) / 2, y: ((yy - y) * dy) / 2, z: ((zz - z) * dz) / 2 };
        massGrams += 8 * halfMm.x * halfMm.y * halfMm.z * density * 1e-6;
        boxes.push({
          halfMm,
          density,
          centerMm: {
            x: min[0]! + ((x + xx) * dx) / 2,
            y: min[1]! + ((y + yy) * dy) / 2,
            z: min[2]! + ((z + zz) * dz) / 2,
          },
        });
      }
  if (boxes.length > 3000)
    throw new Error(
      `${shape.name}: simplify this mesh; its gravity collision model is too complex.`,
    );
  return { boxes, massGrams };
}

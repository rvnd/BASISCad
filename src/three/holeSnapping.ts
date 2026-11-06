import * as THREE from 'three';
import { HOLE_TOLERANCE_MM } from '../app/constants';
import type { PlacedPiece } from '../app/design';

export interface HolePoint {
  x: number;
  z: number;
}

export interface HoleSnapResult {
  x: number;
  z: number;
  snapped: boolean;
}

const holeCache = new WeakMap<THREE.BufferGeometry, readonly HolePoint[]>();

function pointKey(x: number, z: number): string {
  return `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
}

function polygonArea(points: readonly HolePoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a !== undefined && b !== undefined) area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

function containsPoint(polygon: readonly HolePoint[], point: HolePoint): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    const crosses = a.z > point.z !== b.z > point.z;
    if (crosses && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Finds vertical through-holes in a watertight, flat mesh by taking a
 * horizontal cross section through its middle. Nested section loops are
 * the inside walls of holes; the outer contour is discarded. Results
 * are cached because library geometry is immutable after loading.
 */
export function findVerticalThroughHoles(geometry: THREE.BufferGeometry): readonly HolePoint[] {
  const cached = holeCache.get(geometry);
  if (cached !== undefined) return cached;

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const position = geometry.getAttribute('position');
  if (bounds === null || position === undefined || position.count < 3) {
    holeCache.set(geometry, []);
    return [];
  }
  const sliceY = (bounds.min.y + bounds.max.y) / 2;
  const index = geometry.getIndex();
  const triangleCount = index === null ? position.count / 3 : index.count / 3;
  const segments: Array<[HolePoint, HolePoint]> = [];
  const vertex = (i: number): THREE.Vector3 => {
    const at = index === null ? i : index.getX(i);
    return new THREE.Vector3().fromBufferAttribute(position, at);
  };

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertices = [vertex(triangle * 3), vertex(triangle * 3 + 1), vertex(triangle * 3 + 2)];
    const intersections: HolePoint[] = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = vertices[edge];
      const b = vertices[(edge + 1) % 3];
      if (a === undefined || b === undefined || a.y < sliceY === b.y < sliceY) continue;
      const t = (sliceY - a.y) / (b.y - a.y);
      const point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      if (
        !intersections.some((other) => pointKey(other.x, other.z) === pointKey(point.x, point.z))
      ) {
        intersections.push(point);
      }
    }
    if (intersections.length === 2) {
      const first = intersections[0];
      const second = intersections[1];
      if (first !== undefined && second !== undefined) segments.push([first, second]);
    }
  }

  const nodes = new Map<string, HolePoint>();
  const adjacency = new Map<string, string[]>();
  for (const [a, b] of segments) {
    const ka = pointKey(a.x, a.z);
    const kb = pointKey(b.x, b.z);
    if (ka === kb) continue;
    nodes.set(ka, a);
    nodes.set(kb, b);
    adjacency.set(ka, [...(adjacency.get(ka) ?? []), kb]);
    adjacency.set(kb, [...(adjacency.get(kb) ?? []), ka]);
  }

  const unused = new Set<string>();
  for (const [a, b] of segments)
    unused.add([pointKey(a.x, a.z), pointKey(b.x, b.z)].sort().join('|'));
  const loops: HolePoint[][] = [];
  for (const [start, neighbors] of adjacency) {
    for (const first of neighbors) {
      const firstEdge = [start, first].sort().join('|');
      if (!unused.has(firstEdge)) continue;
      const loop: HolePoint[] = [];
      let previous = start;
      let current = first;
      unused.delete(firstEdge);
      const startPoint = nodes.get(start);
      if (startPoint !== undefined) loop.push(startPoint);
      let closed = false;
      for (let guard = 0; guard < segments.length + 1; guard += 1) {
        if (current === start) {
          closed = true;
          break;
        }
        const point = nodes.get(current);
        if (point !== undefined) loop.push(point);
        const next = (adjacency.get(current) ?? []).find((candidate) => candidate !== previous);
        if (next === undefined) break;
        unused.delete([current, next].sort().join('|'));
        previous = current;
        current = next;
      }
      if (closed && loop.length >= 4 && Math.abs(polygonArea(loop)) > 0.03) loops.push(loop);
    }
  }

  const holes = loops
    .filter((loop, index) => {
      const sample = loop[0];
      if (sample === undefined) return false;
      const nesting = loops.reduce((count, other, otherIndex) => {
        return otherIndex !== index &&
          Math.abs(polygonArea(other)) > Math.abs(polygonArea(loop)) &&
          containsPoint(other, sample)
          ? count + 1
          : count;
      }, 0);
      return nesting % 2 === 1;
    })
    .map((loop) => {
      // Polygon centroid is robust for the nearly circular section loops
      // used for drilled and moulded holes.
      let twiceArea = 0;
      let x = 0;
      let z = 0;
      for (let i = 0; i < loop.length; i += 1) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        if (a === undefined || b === undefined) continue;
        const cross = a.x * b.z - b.x * a.z;
        twiceArea += cross;
        x += (a.x + b.x) * cross;
        z += (a.z + b.z) * cross;
      }
      return { x: x / (3 * twiceArea), z: z / (3 * twiceArea) };
    });

  holeCache.set(geometry, holes);
  return holes;
}

function worldHole(piece: PlacedPiece, hole: HolePoint): HolePoint {
  const angle = THREE.MathUtils.degToRad(piece.rotation.y);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: piece.position.x + hole.x * cos + hole.z * sin,
    z: piece.position.z - hole.x * sin + hole.z * cos,
  };
}

/** Snap a dragged piece to the nearest hole on another piece within 2 mm. */
export function snapToAlignedHole(
  movingId: string,
  proposed: { x: number; z: number },
  placed: readonly PlacedPiece[],
  holesByPlacedId: ReadonlyMap<string, readonly HolePoint[]>,
): HoleSnapResult {
  const moving = placed.find((piece) => piece.id === movingId);
  const movingHoles = holesByPlacedId.get(movingId);
  if (moving === undefined || movingHoles === undefined || movingHoles.length === 0) {
    return { ...proposed, snapped: false };
  }
  if (moving.rotation.x !== 0 || moving.rotation.z !== 0) {
    return { ...proposed, snapped: false };
  }

  let best: { dx: number; dz: number; distance: number } | null = null;
  for (const target of placed) {
    if (target.id === movingId) continue;
    if (target.rotation.x !== 0 || target.rotation.z !== 0) continue;
    const targetHoles = holesByPlacedId.get(target.id);
    if (targetHoles === undefined) continue;
    for (const movingHole of movingHoles) {
      const local = worldHole(moving, movingHole);
      const movingWorld = {
        x: proposed.x + local.x - moving.position.x,
        z: proposed.z + local.z - moving.position.z,
      };
      for (const targetHole of targetHoles) {
        const targetWorld = worldHole(target, targetHole);
        const dx = targetWorld.x - movingWorld.x;
        const dz = targetWorld.z - movingWorld.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= HOLE_TOLERANCE_MM && (best === null || distance < best.distance)) {
          best = { dx, dz, distance };
        }
      }
    }
  }
  return best === null
    ? { ...proposed, snapped: false }
    : { x: proposed.x + best.dx, z: proposed.z + best.dz, snapped: true };
}

import * as THREE from 'three';
import { HOLE_TOLERANCE_MM } from '../app/constants';
import type { PlacedPiece } from '../app/design';
import type { LibraryHole } from '../app/libraryHoles';
import type { LibraryPiece } from '../app/library';
import { findVerticalThroughHoles } from './holeSnapping';
import type { HoleSnapResult } from './holeSnapping';
import { pieceMatrix, pieceQuaternion } from './pieceTransforms';

export interface WorldHole {
  pieceId: string;
  holeIndex: number;
  center: THREE.Vector3;
  axis: THREE.Vector3;
  entry: THREE.Vector3;
  exit: THREE.Vector3;
  radius: number;
}

interface LocalHole extends LibraryHole {
  near: number;
  far: number;
}

const EPS = 1e-6;
const cache = new WeakMap<
  THREE.BufferGeometry,
  { source: LibraryPiece['holes']; holes: LocalHole[] }
>();

/** Measure the actual wall around each bore, rather than the whole brace's bounding box. */
function wallExtents(geometry: THREE.BufferGeometry, hole: LibraryHole): [number, number] {
  const center = new THREE.Vector3(hole.center.x, hole.center.y, hole.center.z);
  const axis = new THREE.Vector3(hole.axis.x, hole.axis.y, hole.axis.z);
  const u = new THREE.Vector3(Math.abs(axis.y) < 0.9 ? 0 : 1, Math.abs(axis.y) < 0.9 ? 1 : 0, 0)
    .cross(axis)
    .normalize();
  const v = axis.clone().cross(u);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const ray = new THREE.Raycaster();
  const span = geometry.boundingBox!.getSize(new THREE.Vector3()).length() + 1;
  const extents: Array<[number, number]> = [];
  for (const direction of [u, v, u.clone().negate(), v.clone().negate()]) {
    ray.set(
      center
        .clone()
        .addScaledVector(direction, hole.radius + 0.25)
        .addScaledVector(axis, -span),
      axis,
    );
    const distances = ray.intersectObject(mesh).map((hit) => hit.point.sub(center).dot(axis));
    const below = distances.filter((distance) => distance <= EPS);
    const above = distances.filter((distance) => distance >= -EPS);
    if (below.length && above.length) {
      const near = Math.max(...below);
      const far = Math.min(...above);
      if (far - near > EPS) extents.push([near, far]);
    }
  }
  material.dispose();
  if (!extents.length) return [Number.NaN, Number.NaN];
  // A bore through an edge can have one missing sample; the remaining wall samples agree.
  extents.sort((a, b) => a[1] - a[0] - (b[1] - b[0]));
  return extents[Math.floor(extents.length / 2)]!;
}

function localHoles(geometry: THREE.BufferGeometry, library: LibraryPiece): readonly LocalHole[] {
  const previous = cache.get(geometry);
  if (previous && previous.source === library.holes) return previous.holes;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const source =
    library.holes ??
    findVerticalThroughHoles(geometry).flatMap((hole) =>
      hole.radius
        ? [
            {
              center: { x: hole.x, y: (box.min.y + box.max.y) / 2, z: hole.z },
              axis: { x: 0, y: 1, z: 0 },
              radius: hole.radius,
            },
          ]
        : [],
    );
  const holes = source
    .map((hole) => {
      const [near, far] = wallExtents(geometry, hole);
      return { ...hole, near, far };
    })
    .filter((hole) => Number.isFinite(hole.near) && Number.isFinite(hole.far));
  cache.set(geometry, { source: library.holes, holes });
  return holes;
}

export function worldHolesForPiece(
  piece: PlacedPiece,
  library: LibraryPiece,
  geometry: THREE.BufferGeometry,
): readonly WorldHole[] {
  const matrix = pieceMatrix(piece, geometry);
  const rotation = pieceQuaternion(piece.rotation);
  return localHoles(geometry, library).map((hole, holeIndex) => {
    const center = new THREE.Vector3(hole.center.x, hole.center.y, hole.center.z).applyMatrix4(
      matrix,
    );
    const axis = new THREE.Vector3(hole.axis.x, hole.axis.y, hole.axis.z)
      .applyQuaternion(rotation)
      .normalize();
    return {
      pieceId: piece.id,
      holeIndex,
      center,
      axis,
      entry: center.clone().addScaledVector(axis, hole.near),
      exit: center.clone().addScaledVector(axis, hole.far),
      radius: hole.radius,
    };
  });
}

export function holesAlign(a: WorldHole, b: WorldHole): boolean {
  if (a.pieceId === b.pieceId || Math.abs(a.axis.dot(b.axis)) < 1 - EPS) return false;
  const delta = b.center.clone().sub(a.center);
  return delta.addScaledVector(a.axis, -delta.dot(a.axis)).length() <= HOLE_TOLERANCE_MM + EPS;
}

/** Translate to coaxial holes; a small height correction supports horizontal and tilted bores. */
export function snapToWorldHole(
  piece: PlacedPiece,
  proposed: { x: number; z: number },
  holes: readonly WorldHole[],
): HoleSnapResult {
  const offset = new THREE.Vector3(proposed.x - piece.position.x, 0, proposed.z - piece.position.z);
  let best: THREE.Vector3 | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const moving of holes) {
    if (moving.pieceId !== piece.id) continue;
    for (const target of holes) {
      if (target.pieceId === piece.id || Math.abs(moving.axis.dot(target.axis)) < 1 - EPS) continue;
      const correction = target.center.clone().sub(moving.center).sub(offset);
      correction.addScaledVector(moving.axis, -correction.dot(moving.axis));
      const distance = correction.length();
      if (
        distance > HOLE_TOLERANCE_MM + EPS ||
        distance >= bestDistance ||
        piece.position.y + correction.y < -EPS
      )
        continue;
      best = correction;
      bestDistance = distance;
    }
  }
  if (!best) return { ...proposed, snapped: false };
  return {
    x: proposed.x + best.x,
    z: proposed.z + best.z,
    ...(Math.abs(best.y) > EPS ? { y: Math.max(0, piece.position.y + best.y) } : {}),
    snapped: true,
  };
}

export function alignedHoleMarkers(
  holes: readonly WorldHole[],
): readonly { position: THREE.Vector3; axis: THREE.Vector3 }[] {
  const aligned = new Set<WorldHole>();
  for (let i = 0; i < holes.length; i += 1) {
    for (let j = i + 1; j < holes.length; j += 1) {
      const a = holes[i]!;
      const b = holes[j]!;
      if (holesAlign(a, b)) {
        aligned.add(a);
        aligned.add(b);
      }
    }
  }
  const markers = new Map<string, { position: THREE.Vector3; axis: THREE.Vector3 }>();
  for (const hole of aligned) {
    const axis = hole.axis.clone();
    const major =
      Math.abs(axis.x) > Math.abs(axis.y) && Math.abs(axis.x) > Math.abs(axis.z)
        ? axis.x
        : Math.abs(axis.y) > Math.abs(axis.z)
          ? axis.y
          : axis.z;
    if (major < 0) axis.negate();
    const radial = hole.center.clone().addScaledVector(axis, -hole.center.dot(axis));
    const key = [...radial.toArray(), ...axis.toArray()].map((value) => value.toFixed(2)).join(',');
    const surface = hole.entry.dot(axis) > hole.exit.dot(axis) ? hole.entry : hole.exit;
    const position = surface.clone().addScaledVector(axis, 0.8);
    const existing = markers.get(key);
    if (!existing || position.dot(axis) > existing.position.dot(axis))
      markers.set(key, { position, axis });
  }
  return [...markers.values()];
}

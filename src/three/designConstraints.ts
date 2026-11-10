import * as THREE from 'three';
import type { PlacedPiece, PositionMm } from '../app/design';
import type { LibraryPiece } from '../app/library';
import { WORKPLANE_HALF_MM } from '../app/constants';
import { getGeometry } from './libraryGeometry';
import { pieceMatrix } from './pieceTransforms';
import { COLLISION_EPS_MM, meshesOverlap } from './meshCollision';
import { fastenerGeometry } from './fastenerGeometry';

export type GeometryLookup = (piece: PlacedPiece) => THREE.BufferGeometry | undefined;

export function geometryLookup(library: ReadonlyMap<string, LibraryPiece>): GeometryLookup {
  return (piece) => {
    if (piece.fastener) return fastenerGeometry(piece);
    const id = library.get(piece.libraryId)?.geometryId;
    return id ? getGeometry(id) : undefined;
  };
}

export function pieceBounds(piece: PlacedPiece, geometry: THREE.BufferGeometry): THREE.Box3 {
  const matrix = pieceMatrix(piece, geometry);
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i += 1)
    box.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(matrix));
  return box;
}

export function clampPiece(piece: PlacedPiece, geometry: THREE.BufferGeometry): PlacedPiece {
  const box = pieceBounds(piece, geometry);
  const position = { ...piece.position, y: Math.max(0, piece.position.y) };
  for (const axis of ['x', 'z'] as const) {
    position[axis] +=
      box.max[axis] - box.min[axis] > WORKPLANE_HALF_MM * 2
        ? -(box.min[axis] + box.max[axis]) / 2
        : Math.max(0, -WORKPLANE_HALF_MM - box.min[axis]) -
          Math.max(0, box.max[axis] - WORKPLANE_HALF_MM);
  }
  return samePosition(piece.position, position) ? piece : { ...piece, position };
}

function samePosition(a: PositionMm, b: PositionMm): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}
function samePose(a: PlacedPiece, b: PlacedPiece): boolean {
  return samePosition(a.position, b.position) && samePosition(a.rotation, b.rotation);
}

export function canPlace(
  piece: PlacedPiece,
  others: readonly PlacedPiece[],
  geometry: GeometryLookup,
): boolean {
  const mesh = geometry(piece);
  if (!mesh) return false;
  if (pieceBounds(piece, mesh).min.y < -COLLISION_EPS_MM) return false;
  const matrix = pieceMatrix(piece, mesh);
  return others.every((other) => {
    if (other.id === piece.id) return true;
    const otherMesh = geometry(other);
    return !otherMesh || !meshesOverlap(mesh, matrix, otherMesh, pieceMatrix(other, otherMesh));
  });
}

/** Validate a whole edit atomically, including intermediate rotation poses. */
export function constrainDesignEdit(
  previous: readonly PlacedPiece[],
  proposed: readonly PlacedPiece[],
  geometry: GeometryLookup,
): readonly PlacedPiece[] {
  const old = new Map(previous.map((piece) => [piece.id, piece]));
  const next = proposed.map((piece) => {
    const mesh = geometry(piece);
    return mesh ? clampPiece(piece, mesh) : piece;
  });
  const changed = next.filter(
    (piece) => !old.has(piece.id) || !samePose(old.get(piece.id)!, piece),
  );
  if (!changed.length) return proposed.length === previous.length ? previous : next;
  for (const piece of changed) {
    if (!canPlace(piece, next, geometry)) return previous;
    const before = old.get(piece.id);
    if (!before || samePosition(before.rotation, piece.rotation)) continue;
    const deltas = (['x', 'y', 'z'] as const).map((axis) => {
      const delta = piece.rotation[axis] - before.rotation[axis];
      return delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta;
    });
    const steps = Math.ceil(Math.max(...deltas.map(Math.abs)) / 3);
    for (let i = 1; i < steps; i += 1) {
      const trial = {
        ...piece,
        rotation: {
          x: before.rotation.x + deltas[0]! * (i / steps),
          y: before.rotation.y + deltas[1]! * (i / steps),
          z: before.rotation.z + deltas[2]! * (i / steps),
        },
      };
      if (!canPlace(trial, next, geometry)) return previous;
    }
  }
  return next;
}

/** Swept drag: slide tangentially, spend blocked travel climbing, then descend beside the far wall. */
export function dragPiece(
  piece: PlacedPiece,
  desired: PositionMm,
  others: readonly PlacedPiece[],
  geometry: GeometryLookup,
  baseHeight: number,
): PlacedPiece {
  const mesh = geometry(piece);
  if (!mesh) return piece;
  const target = clampPiece({ ...piece, position: desired }, mesh).position;
  const distance = Math.hypot(target.x - piece.position.x, target.z - piece.position.z);
  const steps = Math.max(1, Math.ceil(distance));
  const dx = (target.x - piece.position.x) / steps;
  const dz = (target.z - piece.position.z) / steps;
  const travel = Math.hypot(dx, dz);
  let current = piece;
  for (let i = 0; i < steps; i += 1) {
    const before = current;
    const candidate = {
      ...current,
      position: { ...current.position, x: current.position.x + dx, z: current.position.z + dz },
    };
    if (canPlace(candidate, others, geometry)) {
      current = candidate;
    } else {
      const slideX = { ...current, position: { ...current.position, x: candidate.position.x } };
      const slideZ = { ...current, position: { ...current.position, z: candidate.position.z } };
      let slid = false;
      if (Math.abs(dx) > 1e-8 && canPlace(slideX, others, geometry)) {
        current = slideX;
        slid = true;
      }
      if (Math.abs(dz) > 1e-8 && canPlace(slideZ, others, geometry)) {
        current = slideZ;
        slid = true;
      }
      const rise = {
        ...current,
        position: { ...current.position, y: current.position.y + travel },
      };
      if (!slid && canPlace(rise, others, geometry)) current = rise;
    }
    if (current.position.y > baseHeight + COLLISION_EPS_MM) {
      const lower = {
        ...current,
        position: { ...current.position, y: Math.max(baseHeight, current.position.y - travel) },
      };
      // Only descend after advancing horizontally; a blocked wall must retain its climb progress.
      if (current.position.x !== before.position.x || current.position.z !== before.position.z) {
        if (canPlace(lower, others, geometry)) current = lower;
        else {
          let blocked = lower.position.y;
          let clear = current.position.y;
          for (let attempt = 0; attempt < 16 && clear - blocked > COLLISION_EPS_MM; attempt += 1) {
            const height = (clear + blocked) / 2;
            const trial = { ...current, position: { ...current.position, y: height } };
            if (canPlace(trial, others, geometry)) clear = height;
            else blocked = height;
          }
          current = { ...current, position: { ...current.position, y: clear } };
        }
      }
    }
  }
  if (distance <= COLLISION_EPS_MM && desired.y !== piece.position.y) {
    const height = { ...current, position: { ...current.position, y: Math.max(0, desired.y) } };
    if (canPlace(height, others, geometry)) current = height;
  }
  return samePose(current, piece) ? piece : current;
}

/** Find a free initial position so adding another long girder never starts with an overlap. */
export function freePlacement(
  piece: PlacedPiece,
  others: readonly PlacedPiece[],
  geometry: GeometryLookup,
): PlacedPiece | null {
  const mesh = geometry(piece);
  if (!mesh) return null;
  const start = clampPiece(piece, mesh);
  if (canPlace(start, others, geometry)) return start;
  for (let radius = 20; radius <= 1000; radius += 20) {
    for (const [x, z] of [
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [radius, radius],
      [-radius, -radius],
    ]) {
      const trial = clampPiece(
        {
          ...start,
          position: { ...start.position, x: start.position.x + x!, z: start.position.z + z! },
        },
        mesh,
      );
      if (canPlace(trial, others, geometry)) return trial;
    }
  }
  return null;
}

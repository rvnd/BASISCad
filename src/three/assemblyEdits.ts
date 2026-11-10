import * as THREE from 'three';
import type { PlacedPiece, PositionMm, RotationDeg } from '../app/design';
import type { LibraryPiece } from '../app/library';
import { groupSelection, motionIds } from '../app/groups';
import { hingeFastener } from '../app/connections';
import { setPiecesRotation } from '../app/design';
import { normalizeAngleDeg } from '../app/rotation';
import { WORKPLANE_HALF_MM } from '../app/constants';
import { canPlace, constrainDesignEdit, geometryLookup, pieceBounds } from './designConstraints';
import {
  pieceMatrix,
  pieceQuaternion,
  quaternionRotation,
  transformPiece,
} from './pieceTransforms';
import { meshesOverlap } from './meshCollision';
import { canonicalAxis, designHoles, worldHole } from './connectionHoles';

export function assemblyBounds(
  placed: readonly PlacedPiece[],
  ids: ReadonlySet<string>,
  library: ReadonlyMap<string, LibraryPiece>,
): THREE.Box3 {
  const bounds = new THREE.Box3(),
    geometry = geometryLookup(library);
  for (const piece of placed)
    if (ids.has(piece.id) && geometry(piece)) bounds.union(pieceBounds(piece, geometry(piece)!));
  return bounds;
}

export function selectionPose(
  placed: readonly PlacedPiece[],
  ids: readonly string[],
  library: ReadonlyMap<string, LibraryPiece>,
): { position: PositionMm; rotation: RotationDeg; groupId?: string } | null {
  const selected = placed.filter((piece) => ids.includes(piece.id));
  if (!selected.length) return null;
  const first = selected[0]!;
  if (first.groupId && selected.every((piece) => piece.groupId === first.groupId)) {
    const box = assemblyBounds(placed, groupSelection(placed, ids), library);
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    return {
      position: { x: center.x, y: box.min.y, z: center.z },
      rotation: first.groupRotation ?? { x: 0, y: 0, z: 0 },
      groupId: first.groupId,
    };
  }
  return { position: first.position, rotation: first.rotation };
}

function translate(
  placed: readonly PlacedPiece[],
  ids: ReadonlySet<string>,
  delta: THREE.Vector3,
): readonly PlacedPiece[] {
  return placed.map((piece) =>
    ids.has(piece.id)
      ? {
          ...piece,
          position: {
            x: piece.position.x + delta.x,
            y: piece.position.y + delta.y,
            z: piece.position.z + delta.z,
          },
        }
      : piece,
  );
}

function clampAssembly(
  placed: readonly PlacedPiece[],
  ids: ReadonlySet<string>,
  library: ReadonlyMap<string, LibraryPiece>,
): readonly PlacedPiece[] | null {
  const box = assemblyBounds(placed, ids, library);
  if (
    box.isEmpty() ||
    box.max.x - box.min.x > WORKPLANE_HALF_MM * 2 ||
    box.max.z - box.min.z > WORKPLANE_HALF_MM * 2
  )
    return null;
  const delta = new THREE.Vector3(
    box.min.x < -WORKPLANE_HALF_MM
      ? -WORKPLANE_HALF_MM - box.min.x
      : box.max.x > WORKPLANE_HALF_MM
        ? WORKPLANE_HALF_MM - box.max.x
        : 0,
    Math.max(0, -box.min.y),
    box.min.z < -WORKPLANE_HALF_MM
      ? -WORKPLANE_HALF_MM - box.min.z
      : box.max.z > WORKPLANE_HALF_MM
        ? WORKPLANE_HALF_MM - box.max.z
        : 0,
  );
  return delta.lengthSq() > 1e-20 ? translate(placed, ids, delta) : placed;
}

function valid(
  placed: readonly PlacedPiece[],
  ids: ReadonlySet<string>,
  library: ReadonlyMap<string, LibraryPiece>,
): boolean {
  const geometry = geometryLookup(library);
  const fixed = placed.filter((piece) => !ids.has(piece.id));
  return placed.every((piece) => !ids.has(piece.id) || canPlace(piece, fixed, geometry));
}

/** A common rigid transform preserves member-to-member contacts. Check them once. */
function rigidMembersClear(
  placed: readonly PlacedPiece[],
  ids: ReadonlySet<string>,
  library: ReadonlyMap<string, LibraryPiece>,
): boolean {
  const members = placed.filter((piece) => ids.has(piece.id)),
    geometry = geometryLookup(library);
  for (let i = 0; i < members.length; i++) {
    const piece = members[i]!,
      mesh = geometry(piece);
    if (!mesh) return false;
    for (let j = i + 1; j < members.length; j++) {
      const other = members[j]!,
        otherMesh = geometry(other);
      if (!otherMesh) return false;
      if (piece.fastener?.clearanceOverride || other.fastener?.clearanceOverride) continue;
      if (meshesOverlap(mesh, pieceMatrix(piece, mesh), otherMesh, pieceMatrix(other, otherMesh)))
        return false;
    }
  }
  return true;
}

export function moveAssembly(
  placed: readonly PlacedPiece[],
  selected: readonly string[],
  target: PositionMm,
  library: ReadonlyMap<string, LibraryPiece>,
  sweep = false,
): readonly PlacedPiece[] {
  const ids = motionIds(placed, selected),
    pose = selectionPose(placed, selected, library);
  if (!pose || placed.some((piece) => ids.has(piece.id) && piece.locked)) return placed;
  const delta = new THREE.Vector3(
    target.x - pose.position.x,
    target.y - pose.position.y,
    target.z - pose.position.z,
  );
  if (delta.lengthSq() < 1e-16) return placed;
  if (!rigidMembersClear(placed, ids, library)) return placed;
  const steps = sweep ? Math.max(1, Math.ceil(delta.length())) : 1;
  let result = placed;
  for (let i = 1; i <= steps; i++) {
    const candidate = clampAssembly(
      translate(placed, ids, delta.clone().multiplyScalar(i / steps)),
      ids,
      library,
    );
    if (!candidate || !valid(candidate, ids, library)) return sweep ? result : placed;
    result = candidate;
  }
  return result;
}

function pivotTransform(center: THREE.Vector3, quaternion: THREE.Quaternion): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(center.x, center.y, center.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
}

/** Rotate every member with the same world transform, including each intermediate collision check. */
export function rotateAssembly(
  placed: readonly PlacedPiece[],
  selected: readonly string[],
  rotation: RotationDeg,
  library: ReadonlyMap<string, LibraryPiece>,
): readonly PlacedPiece[] {
  const ids = motionIds(placed, selected),
    pose = selectionPose(placed, selected, library);
  if (!pose || placed.some((piece) => ids.has(piece.id) && piece.locked)) return placed;
  const normalized = {
    x: normalizeAngleDeg(rotation.x),
    y: normalizeAngleDeg(rotation.y),
    z: normalizeAngleDeg(rotation.z),
  };
  if (ids.size === 1 && !pose.groupId) {
    let proposed = placed;
    for (const axis of ['x', 'y', 'z'] as const)
      proposed = setPiecesRotation(proposed, selected, axis, normalized[axis]);
    return constrainDesignEdit(placed, proposed, geometryLookup(library));
  }
  const center = assemblyBounds(placed, ids, library).getCenter(new THREE.Vector3());
  const delta = pieceQuaternion(normalized)
    .multiply(pieceQuaternion(pose.rotation).invert())
    .normalize();
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  const angle = 2 * Math.acos(Math.min(1, delta.w));
  if (angle < 1e-8) return placed;
  if (!rigidMembersClear(placed, ids, library)) return placed;
  const steps = Math.max(1, Math.ceil(THREE.MathUtils.radToDeg(angle) / 3)),
    geometry = geometryLookup(library);
  let result = placed;
  for (let i = 1; i <= steps; i++) {
    const matrix = pivotTransform(center, new THREE.Quaternion().slerp(delta, i / steps));
    const transformed = placed.map((piece) =>
      ids.has(piece.id) && geometry(piece)
        ? transformPiece(piece, geometry(piece)!, matrix)
        : piece,
    );
    const candidate = clampAssembly(transformed, ids, library);
    if (!candidate || !valid(candidate, ids, library)) return placed;
    result = candidate;
  }
  return result.map((piece) =>
    piece.groupId && ids.has(piece.id)
      ? {
          ...piece,
          groupRotation:
            piece.groupId === pose.groupId
              ? normalized
              : quaternionRotation(
                  delta
                    .clone()
                    .multiply(pieceQuaternion(piece.groupRotation ?? { x: 0, y: 0, z: 0 })),
                ),
        }
      : piece,
  );
}

export function hingeInfo(
  placed: readonly PlacedPiece[],
  id: string,
  library: ReadonlyMap<string, LibraryPiece>,
): { pivot: PositionMm; axis: PositionMm; angle: number } | null {
  const piece = placed.find((entry) => entry.id === id),
    unit = hingeFastener(placed, id);
  if (!piece || piece.fastener || piece.groupId || piece.locked || !unit) return null;
  const pivot = worldHole(
    designHoles(placed, library),
    unit.fastener!.holes.find((hole) => hole.pieceId === id)!,
  );
  if (!pivot) return null;
  const axis = canonicalAxis(pivot.axis);
  return {
    pivot: { x: pivot.center.x, y: pivot.center.y, z: pivot.center.z },
    axis: { x: axis.x, y: axis.y, z: axis.z },
    angle: piece.hingeAngleDeg ?? 0,
  };
}

/** A hinge changes only the selected stock pose; its fastener and the other stock stay fixed. */
export function swingPiece(
  placed: readonly PlacedPiece[],
  id: string,
  angle: number,
  library: ReadonlyMap<string, LibraryPiece>,
): readonly PlacedPiece[] {
  const info = hingeInfo(placed, id, library),
    piece = placed.find((entry) => entry.id === id);
  if (!info || !piece) return placed;
  const axis = new THREE.Vector3(info.axis.x, info.axis.y, info.axis.z),
    center = new THREE.Vector3(info.pivot.x, info.pivot.y, info.pivot.z);
  const radians = THREE.MathUtils.degToRad(angle - info.angle),
    steps = Math.max(1, Math.ceil(Math.abs(angle - info.angle) / 3)),
    geometry = geometryLookup(library);
  const mesh = geometry(piece);
  if (!mesh) return placed;
  let moved = piece;
  for (let i = 1; i <= steps; i++) {
    moved = transformPiece(
      piece,
      mesh,
      pivotTransform(center, new THREE.Quaternion().setFromAxisAngle(axis, (radians * i) / steps)),
    );
    if (!canPlace(moved, placed, geometry)) return placed;
  }
  return placed.map((entry) => (entry.id === id ? { ...moved, hingeAngleDeg: angle } : entry));
}

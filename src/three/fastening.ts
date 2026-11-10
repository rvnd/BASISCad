import * as THREE from 'three';
import type { PlacedPiece } from '../app/design';
import type { HoleRef } from '../app/connections';
import { attachedPieceIds, sameHole } from '../app/connections';
import type { LibraryPiece } from '../app/library';
import { getScrewLengthInches } from '../app/screws';
import { canPlace, geometryLookup } from './designConstraints';
import { canonicalAxis, designHoles, holeInterval, holeStack, worldHole } from './connectionHoles';
import type { WorldHole } from './orientedHoles';
import { fastenerGeometry, fastenerStackBottom } from './fastenerGeometry';
import { quaternionRotation, rotationLift } from './pieceTransforms';

const EPS = 0.00002;

function assemblyIds(placed: readonly PlacedPiece[], pieceId: string): ReadonlySet<string> {
  const pieces = attachedPieceIds(placed, pieceId);
  return new Set([
    ...pieces,
    ...placed
      .filter((piece) => piece.fastener?.holes.some((hole) => pieces.has(hole.pieceId)))
      .map((piece) => piece.id),
  ]);
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

function hardwarePose(stack: readonly WorldHole[], axis: THREE.Vector3, id: string): PlacedPiece {
  const intervals = stack.map((hole) => holeInterval(hole, axis));
  const near = Math.min(...intervals.map((interval) => interval[0]));
  const far = Math.max(...intervals.map((interval) => interval[1]));
  const lengthInches = getScrewLengthInches(stack.length) as 0.375 | 0.5;
  const piece: PlacedPiece = {
    id,
    libraryId: lengthInches === 0.375 ? 'fastener-3-8' : 'fastener-1-2',
    position: { x: 0, y: 0, z: 0 },
    rotation: quaternionRotation(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis),
    ),
    fastener: {
      holes: stack.map(({ pieceId, holeIndex }) => ({ pieceId, holeIndex })),
      lengthInches,
      stackDepthMm: far - near,
    },
  };
  const geometry = fastenerGeometry(piece)!;
  const anchor = stack[0]!.center;
  const origin = anchor
    .clone()
    .addScaledVector(axis, near - anchor.dot(axis) - fastenerStackBottom(piece));
  piece.position = {
    x: origin.x,
    y: origin.y - rotationLift(geometry, piece.rotation),
    z: origin.z,
  };
  return piece;
}

/** Align a stack and add or extend one paired fastener. Stock collisions and the floor remain mandatory. */
export function fastenStack(
  placed: readonly PlacedPiece[],
  library: ReadonlyMap<string, LibraryPiece>,
  ref: HoleRef,
  id: string,
  overrideClearance = false,
  preserveAssembly = false,
): readonly PlacedPiece[] | null {
  const originalHoles = designHoles(placed, library);
  const originalStack = holeStack(originalHoles, ref);
  if (originalStack.length < 2 || originalStack.length > 4) return null;
  const anchor = worldHole(originalHoles, ref)!;
  const axis = canonicalAxis(anchor.axis);
  const geometry = geometryLookup(library);
  let aligned = placed;
  const done = new Set<string>();
  for (const hole of originalStack) {
    if (done.has(hole.pieceId)) continue;
    const ids = assemblyIds(placed, hole.pieceId);
    for (const pieceId of ids) done.add(pieceId);
    const delta = anchor.center.clone().sub(hole.center);
    delta.addScaledVector(axis, -delta.dot(axis));
    if (delta.length() <= EPS) continue;
    if (
      ids.has(anchor.pieceId) ||
      preserveAssembly ||
      placed.some((piece) => ids.has(piece.id) && piece.locked)
    )
      return null;
    aligned = translate(aligned, ids, delta);
  }
  const stack = holeStack(designHoles(aligned, library), ref);
  const existing = aligned.filter((piece) =>
    piece.fastener?.holes.some((hole) => stack.some((entry) => sameHole(hole, entry))),
  );
  if (
    existing.length === 1 &&
    stack.every((hole) => existing[0]!.fastener!.holes.some((entry) => sameHole(hole, entry)))
  )
    return placed;
  const existingIds = new Set(existing.map((piece) => piece.id));
  const remaining = aligned.filter((piece) => !existingIds.has(piece.id));
  for (const piece of remaining) if (!canPlace(piece, remaining, geometry)) return null;
  const involved = new Set<string>();
  for (const hole of stack)
    for (const pieceId of assemblyIds(remaining, hole.pieceId)) involved.add(pieceId);
  for (const direction of [axis, axis.clone().negate()]) {
    let unit = hardwarePose(stack, direction, existing[0]?.id ?? id);
    if (existing[0]) unit = { ...unit, groupId: existing[0].groupId, locked: existing[0].locked };
    const lift = Math.max(0, -unit.position.y);
    if (
      lift > EPS &&
      (preserveAssembly || remaining.some((piece) => involved.has(piece.id) && piece.locked))
    )
      continue;
    const moved =
      lift > EPS ? translate(remaining, involved, new THREE.Vector3(0, lift, 0)) : remaining;
    if (lift > EPS) unit = { ...unit, position: { ...unit.position, y: 0 } };
    if (
      existing[0]?.locked &&
      Math.hypot(
        unit.position.x - existing[0].position.x,
        unit.position.y - existing[0].position.y,
        unit.position.z - existing[0].position.z,
      ) > EPS
    )
      continue;
    if (moved.some((piece) => involved.has(piece.id) && !canPlace(piece, moved, geometry)))
      continue;
    if (canPlace(unit, moved, geometry) || overrideClearance) return [...moved, unit];
  }
  return null;
}

import * as THREE from 'three';
import type { PlacedPiece, PositionMm } from '../app/design';
import type { HoleRef } from '../app/connections';
import { attachedPieceIds, fastenersAtPiece, hingeFastener, sameHole } from '../app/connections';
import type { LibraryPiece } from '../app/library';
import { HOLE_TOLERANCE_MM } from '../app/constants';
import { canPlace, geometryLookup } from './designConstraints';
import {
  canonicalAxis,
  designHoles,
  holeInterval,
  holeStack,
  positionVector,
  worldHole,
} from './connectionHoles';
import { holesAlign } from './orientedHoles';
import {
  pieceMatrix,
  pieceQuaternion,
  quaternionRotation,
  transformPiece,
} from './pieceTransforms';
import { fastenStack } from './fastening';

export interface ConnectionOptions {
  eitherSide: boolean;
  moreAngles: boolean;
  moveAssembly: boolean;
}

export const DEFAULT_CONNECTION_OPTIONS: ConnectionOptions = {
  eitherSide: false,
  moreAngles: false,
  moveAssembly: false,
};

export interface ConnectionResult {
  placed: readonly PlacedPiece[];
  movingId: string;
  hole: HoleRef;
  extendedFastener: boolean;
}

/** A rigid motion of an assembly; group membership alone does not add pieces. */
function transformDesign(
  placed: readonly PlacedPiece[],
  ids: ReadonlySet<string>,
  library: ReadonlyMap<string, LibraryPiece>,
  matrix: THREE.Matrix4,
): readonly PlacedPiece[] {
  const geometry = geometryLookup(library);
  return placed.map((piece) =>
    ids.has(piece.id) && geometry(piece) ? transformPiece(piece, geometry(piece)!, matrix) : piece,
  );
}

function pivotMatrix(pivot: THREE.Vector3, axis: THREE.Vector3, angle: number): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

/** Solve on data before rendering, so rejected attempts never enter the design or history. */
export function connectPieces(
  placed: readonly PlacedPiece[],
  library: ReadonlyMap<string, LibraryPiece>,
  first: readonly HoleRef[],
  second: readonly HoleRef[],
  cameraPosition: PositionMm,
  options: ConnectionOptions = DEFAULT_CONNECTION_OPTIONS,
): ConnectionResult | null {
  const holes = designHoles(placed, library),
    geometry = geometryLookup(library);
  const camera = positionVector(cameraPosition);
  const finish = (
    candidate: readonly PlacedPiece[],
    ids: ReadonlySet<string>,
    moving: HoleRef,
    target: HoleRef,
  ): ConnectionResult | null => {
    const oldUnits = placed.filter((piece) =>
      piece.fastener?.holes.some((hole) => sameHole(hole, target)),
    );
    const ignored = new Set(oldUnits.map((piece) => piece.id));
    const collisionDesign = candidate.filter((piece) => !ignored.has(piece.id));
    if (
      collisionDesign.some(
        (piece) => ids.has(piece.id) && !canPlace(piece, collisionDesign, geometry),
      )
    )
      return null;
    const nextHoles = designHoles(candidate, library);
    const a = worldHole(nextHoles, moving),
      b = worldHole(nextHoles, target);
    if (!a || !b || !holesAlign(a, b)) return null;
    if (oldUnits.length) {
      const fastened = fastenStack(candidate, library, target, oldUnits[0]!.id, false, true);
      if (
        !fastened ||
        !fastened.some((piece) => piece.fastener?.holes.some((hole) => sameHole(hole, moving)))
      )
        return null;
      return { placed: fastened, movingId: moving.pieceId, hole: moving, extendedFastener: true };
    }
    return { placed: candidate, movingId: moving.pieceId, hole: moving, extendedFastener: false };
  };

  const tryFree = (
    moving: HoleRef,
    target: HoleRef,
    firstMoves: boolean,
    wholeAssembly: boolean,
  ): ConnectionResult | null => {
    const source = placed.find((piece) => piece.id === moving.pieceId),
      fixed = placed.find((piece) => piece.id === target.pieceId);
    const sourceHole = worldHole(holes, moving),
      targetHole = worldHole(holes, target);
    if (!source || !fixed || !sourceHole || !targetHole || source.locked) return null;
    const stockIds = wholeAssembly ? attachedPieceIds(placed, source.id) : new Set([source.id]);
    if (stockIds.has(fixed.id)) return null;
    const ids = new Set([
      ...stockIds,
      ...placed
        .filter(
          (piece) =>
            wholeAssembly && piece.fastener?.holes.some((hole) => stockIds.has(hole.pieceId)),
        )
        .map((piece) => piece.id),
    ]);
    if (placed.some((piece) => ids.has(piece.id) && piece.locked)) return null;
    const mesh = geometry(source);
    if (!mesh) return null;
    const axis = canonicalAxis(targetHole.axis);
    const facing = axis.dot(camera.clone().sub(targetHole.center)) >= 0 ? 1 : -1;
    const defaultSide = facing * (firstMoves ? 1 : -1);
    const sides = options.eitherSide ? [defaultSide, -defaultSide] : [defaultSide];
    const angles = options.moreAngles
      ? Array.from({ length: 24 }, (_, i) => i * 15)
      : [0, 90, 180, 270];
    for (const side of sides) {
      const outward = axis.clone().multiplyScalar(side);
      const interval = holeInterval(targetHole, outward);
      const depth = Math.max(3.175, interval[1] - interval[0]);
      for (let layer = 0; layer < 7; layer++)
        for (const direction of [1, -1])
          for (const angle of angles) {
            const align = new THREE.Quaternion().setFromUnitVectors(
              sourceHole.axis,
              axis.clone().multiplyScalar(direction),
            );
            const spin = new THREE.Quaternion().setFromAxisAngle(
              axis,
              THREE.MathUtils.degToRad(angle),
            );
            const rotation = quaternionRotation(
              spin.multiply(align).multiply(pieceQuaternion(source.rotation)),
            );
            const rotated = { ...source, rotation };
            const bore = designHoles([rotated], library).find((hole) => sameHole(hole, moving));
            if (!bore) continue;
            const near = holeInterval(bore, outward)[0];
            const delta = targetHole.center.clone().sub(bore.center);
            delta.addScaledVector(outward, interval[1] + layer * depth - near - delta.dot(outward));
            const pose = {
              ...rotated,
              position: {
                x: rotated.position.x + delta.x,
                y: rotated.position.y + delta.y,
                z: rotated.position.z + delta.z,
              },
            };
            const transform = pieceMatrix(pose, mesh).multiply(pieceMatrix(source, mesh).invert());
            const candidate = transformDesign(placed, ids, library, transform);
            const result = finish(candidate, ids, moving, target);
            if (result) return result;
          }
    }
    return null;
  };

  const tryHinge = (moving: HoleRef, target: HoleRef): ConnectionResult | null => {
    const piece = placed.find((entry) => entry.id === moving.pieceId);
    const unit = hingeFastener(placed, moving.pieceId);
    const source = worldHole(holes, moving),
      fixed = worldHole(holes, target);
    if (
      !piece ||
      piece.locked ||
      !unit ||
      !source ||
      !fixed ||
      attachedPieceIds(placed, piece.id).has(target.pieceId)
    )
      return null;
    const pivotRef = unit.fastener!.holes.find((hole) => hole.pieceId === piece.id)!;
    const pivot = worldHole(holes, pivotRef);
    if (!pivot) return null;
    const axis = canonicalAxis(pivot.axis);
    const from = source.center.clone().sub(pivot.center),
      to = fixed.center.clone().sub(pivot.center);
    from.addScaledVector(axis, -from.dot(axis));
    to.addScaledVector(axis, -to.dot(axis));
    if (from.length() < 0.01 || Math.abs(from.length() - to.length()) > HOLE_TOLERANCE_MM)
      return null;
    const angle = Math.atan2(axis.dot(from.clone().cross(to)), from.dot(to));
    const ids = new Set([piece.id]);
    for (const turn of [angle, angle + (angle > 0 ? -2 * Math.PI : 2 * Math.PI)]) {
      const steps = Math.max(1, Math.ceil(Math.abs(THREE.MathUtils.radToDeg(turn)) / 3));
      let clear = true;
      for (let step = 1; step <= steps; step++) {
        const candidate = transformDesign(
          placed,
          ids,
          library,
          pivotMatrix(pivot.center, axis, (turn * step) / steps),
        );
        // The target screw can be replaced at the end, but remains a real obstacle during the sweep.
        if (
          !canPlace(
            candidate.find((entry) => entry.id === piece.id)!,
            candidate,
            geometry,
          )
        ) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      const candidate = transformDesign(
        placed,
        ids,
        library,
        pivotMatrix(pivot.center, axis, turn),
      );
      const result = finish(candidate, ids, moving, target);
      if (result) return result;
    }
    return null;
  };

  for (const a of first)
    for (const b of second) {
      if (a.pieceId === b.pieceId) continue;
      // A shared marker can be picked twice to fasten an already aligned neighbouring bore.
      if (holeStack(holes, a).some((hole) => sameHole(hole, b))) {
        const result = finish(placed, new Set(), a, b);
        if (result) return result;
      }
      const firstFree = fastenersAtPiece(placed, a.pieceId).length === 0;
      const secondFree = fastenersAtPiece(placed, b.pieceId).length === 0;
      if (firstFree) {
        const result = tryFree(a, b, true, false);
        if (result) return result;
      }
      if (secondFree) {
        const result = tryFree(b, a, false, false);
        if (result) return result;
      }
      if (!firstFree && !secondFree) {
        const result = tryHinge(a, b) ?? tryHinge(b, a);
        if (result) return result;
      }
      if (options.moveAssembly) {
        const result = tryFree(a, b, true, true) ?? tryFree(b, a, false, true);
        if (result) return result;
      }
    }
  return null;
}

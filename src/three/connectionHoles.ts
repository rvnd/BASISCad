import * as THREE from 'three';
import type { PlacedPiece, PositionMm } from '../app/design';
import type { HoleRef } from '../app/connections';
import { holeHasFastener, sameHole } from '../app/connections';
import type { LibraryPiece } from '../app/library';
import { HOLE_TOLERANCE_MM } from '../app/constants';
import { geometryLookup } from './designConstraints';
import { holesAlign, worldHolesForPiece } from './orientedHoles';
import type { WorldHole } from './orientedHoles';

export interface HoleTarget {
  id: string;
  members: readonly HoleRef[];
  title: string;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  occupied: boolean;
}

export function designHoles(
  placed: readonly PlacedPiece[],
  library: ReadonlyMap<string, LibraryPiece>,
): readonly WorldHole[] {
  const geometry = geometryLookup(library);
  return placed.flatMap((piece) => {
    const mesh = geometry(piece),
      metadata = library.get(piece.libraryId);
    return mesh && metadata && !piece.fastener ? worldHolesForPiece(piece, metadata, mesh) : [];
  });
}

export function worldHole(holes: readonly WorldHole[], ref: HoleRef): WorldHole | undefined {
  return holes.find((hole) => sameHole(hole, ref));
}

export function canonicalAxis(axis: THREE.Vector3): THREE.Vector3 {
  const result = axis.clone().normalize();
  const values = result.toArray();
  const major = values.reduce(
    (best, value, i) => (Math.abs(value) > Math.abs(values[best]!) ? i : best),
    0,
  );
  return values[major]! < 0 ? result.negate() : result;
}

export function holeInterval(hole: WorldHole, axis: THREE.Vector3): [number, number] {
  const a = hole.entry.dot(axis),
    b = hole.exit.dot(axis);
  return [Math.min(a, b), Math.max(a, b)];
}

/** Limit a fastener to neighbouring layers; distant holes on the same infinite line are not a stack. */
export function holeStack(holes: readonly WorldHole[], ref: HoleRef): readonly WorldHole[] {
  const anchor = worldHole(holes, ref);
  if (!anchor) return [];
  const axis = canonicalAxis(anchor.axis);
  const candidates = holes.filter((hole) => sameHole(hole, anchor) || holesAlign(hole, anchor));
  let [near, far] = holeInterval(anchor, axis);
  const stack = new Set<WorldHole>([anchor]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const hole of candidates) {
      if (stack.has(hole)) continue;
      const [a, b] = holeInterval(hole, axis);
      if (a <= far + HOLE_TOLERANCE_MM && b >= near - HOLE_TOLERANCE_MM) {
        stack.add(hole);
        near = Math.min(near, a);
        far = Math.max(far, b);
        changed = true;
      }
    }
  }
  const seen = new Set<string>();
  return [...stack]
    .sort((a, b) => a.center.dot(axis) - b.center.dot(axis))
    .filter((hole) => {
      if (seen.has(hole.pieceId)) return false;
      seen.add(hole.pieceId);
      return true;
    });
}

/** Small screen markers, grouped at aligned bores and separated when their projections overlap. */
export function projectHoleTargets(
  holes: readonly WorldHole[],
  placed: readonly PlacedPiece[],
  library: ReadonlyMap<string, LibraryPiece>,
  camera: THREE.Camera,
  width: number,
  height: number,
): readonly HoleTarget[] {
  const roots = holes.map((_, i) => i);
  const root = (i: number): number => {
    while (roots[i] !== i) i = roots[i]!;
    return i;
  };
  for (let i = 0; i < holes.length; i++)
    for (let j = i + 1; j < holes.length; j++)
      if (holesAlign(holes[i]!, holes[j]!)) roots[root(j)] = root(i);
  const groups = new Map<number, WorldHole[]>();
  holes.forEach((hole, i) => {
    const id = root(i);
    groups.set(id, [...(groups.get(id) ?? []), hole]);
  });
  const ordinal = new Map(
    placed.filter((piece) => !piece.fastener).map((piece, i) => [piece.id, i + 1]),
  );
  const cameraPosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const targets: HoleTarget[] = [];
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        a.center.distanceToSquared(cameraPosition) - b.center.distanceToSquared(cameraPosition),
    );
    const first = group[0]!;
    const point = first.center.clone().project(camera);
    if (point.z < -1 || point.z > 1) continue;
    const anchorX = ((point.x + 1) * width) / 2,
      anchorY = ((1 - point.y) * height) / 2;
    if (anchorX < 0 || anchorX > width || anchorY < 0 || anchorY > height) continue;
    let x = anchorX,
      y = anchorY;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (targets.every((target) => Math.hypot(target.x - x, target.y - y) >= 15)) break;
      const angle = attempt * 2.399963229728653,
        radius = 12 * Math.sqrt(attempt + 1);
      x = Math.max(8, Math.min(width - 8, anchorX + Math.cos(angle) * radius));
      y = Math.max(8, Math.min(height - 8, anchorY + Math.sin(angle) * radius));
    }
    const members = group.map(({ pieceId, holeIndex }) => ({ pieceId, holeIndex }));
    const title = group
      .map(
        (hole) =>
          `${library.get(placed.find((piece) => piece.id === hole.pieceId)!.libraryId)?.name ?? 'Piece'} (piece ${ordinal.get(hole.pieceId)}), hole ${hole.holeIndex + 1}`,
      )
      .join('; ');
    targets.push({
      id: members
        .map((hole) => `${hole.pieceId}:${hole.holeIndex}`)
        .sort()
        .join('|'),
      members,
      title,
      x,
      y,
      anchorX,
      anchorY,
      occupied: members.some((hole) => holeHasFastener(placed, hole)),
    });
  }
  return targets;
}

export function positionVector(position: PositionMm): THREE.Vector3 {
  return new THREE.Vector3(position.x, position.y, position.z);
}

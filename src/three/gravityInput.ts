import * as THREE from 'three';
import type { PlacedPiece } from '../app/design';
import type { LibraryPiece } from '../app/library';
import type { GravityInput, GravityShape } from '../app/gravity';
import { geometryLookup } from './designConstraints';
import { designHoles, worldHole } from './connectionHoles';
import { pieceMatrix } from './pieceTransforms';

export function prepareGravityInput(
  placed: readonly PlacedPiece[],
  library: ReadonlyMap<string, LibraryPiece>,
  acceleration: number,
): GravityInput {
  const shapes = new Map<string, GravityShape>();
  const geometry = geometryLookup(library);
  const pieces = placed.map((piece) => {
    const mesh = geometry(piece);
    if (!mesh)
      throw new Error(
        `Load the geometry for ${library.get(piece.libraryId)?.name ?? piece.libraryId} before testing gravity.`,
      );
    const shapeId = piece.fastener
      ? `hardware-${piece.fastener.lengthInches}-${piece.fastener.stackDepthMm}`
      : piece.libraryId;
    if (!shapes.has(shapeId)) {
      const attribute = mesh.getAttribute('position'),
        index = mesh.index;
      const count = index?.count ?? attribute.count;
      const positionsMm = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const source = index?.getX(i) ?? i;
        positionsMm.set(
          [attribute.getX(source), attribute.getY(source), attribute.getZ(source)],
          i * 3,
        );
      }
      shapes.set(shapeId, {
        id: shapeId,
        name: library.get(piece.libraryId)?.name ?? 'Screw and nut',
        positionsMm,
        steel: !!piece.fastener,
      });
    }
    const origin = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    pieceMatrix(piece, mesh).decompose(origin, q, scale);
    return {
      id: piece.id,
      shapeId,
      originMm: { x: origin.x, y: origin.y, z: origin.z },
      rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      ...(piece.fastener ? { fastenerFor: piece.fastener.holes.map((h) => h.pieceId) } : {}),
    };
  });
  const holes = designHoles(placed, library);
  const connections = placed
    .filter((p) => p.fastener)
    .map((piece) => {
      const refs = piece.fastener!.holes;
      const anchor = worldHole(holes, refs[0]!);
      if (!anchor || refs.some((ref) => !worldHole(holes, ref)))
        throw new Error(
          'A screw has missing hole geometry. Reset or repair the connection before testing gravity.',
        );
      return {
        id: piece.id,
        pieces: refs.map((h) => h.pieceId),
        pivotMm: { x: anchor.center.x, y: anchor.center.y, z: anchor.center.z },
        axis: { x: anchor.axis.x, y: anchor.axis.y, z: anchor.axis.z },
      };
    });
  return { pieces, shapes: [...shapes.values()], connections, acceleration };
}

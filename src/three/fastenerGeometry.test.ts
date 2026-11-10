import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PlacedPiece } from '../app/design';
import { fastenerGeometry, fastenerStackBottom } from './fastenerGeometry';
import { transformPiece, pieceMatrix } from './pieceTransforms';

const hardware = (layers: number): PlacedPiece => ({
  id: 'screw',
  libraryId: 'hardware',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  fastener: {
    holes: Array.from({ length: layers }, (_, i) => ({ pieceId: String(i), holeIndex: 0 })),
    lengthInches: layers === 2 ? 0.375 : 0.5,
    stackDepthMm: layers * 3.175,
  },
});

describe('paired fastener geometry', () => {
  it.each([2, 3, 4])(
    'places the nut below %i layers, the head above them, and the unit above its base',
    (layers) => {
      const piece = hardware(layers);
      const geometry = fastenerGeometry(piece)!;
      expect(geometry.boundingBox!.min.y).toBeCloseTo(0);
      const stackBottom = fastenerStackBottom(piece);
      expect(stackBottom).toBeGreaterThanOrEqual(2.4);
      expect(
        geometry.boundingBox!.max.y - (stackBottom + piece.fastener!.stackDepthMm),
      ).toBeCloseTo(1.8);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(1.79, -1, 0),
        new THREE.Vector3(0, 1, 0),
        0,
        stackBottom + 1,
      );
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );
      expect(ray.intersectObject(mesh)).toHaveLength(0);
      mesh.material.dispose();
    },
  );

  it('applies a rigid rotation about a world pivot without changing any vertex relative to that transform', () => {
    const piece = {
      ...hardware(2),
      position: { x: 20, y: 30, z: 10 },
      rotation: { x: 25, y: 10, z: 5 },
    };
    const geometry = fastenerGeometry(piece)!;
    const transform = new THREE.Matrix4()
      .makeTranslation(10, 20, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeTranslation(-10, -20, 0));
    const moved = transformPiece(piece, geometry, transform);
    const oldMatrix = transform.clone().multiply(pieceMatrix(piece, geometry));
    const newMatrix = pieceMatrix(moved, geometry);
    for (let i = 0; i < 16; i++)
      expect(newMatrix.elements[i]).toBeCloseTo(oldMatrix.elements[i]!, 8);
  });
});

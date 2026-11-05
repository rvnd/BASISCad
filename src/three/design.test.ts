import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  createPlacedPiece,
  defaultPlacement,
  removePlaced,
  toggleSelection,
} from '../app/design';

describe('design', () => {
  const small = { x: 50, y: 3, z: 12 };

  it('places the first piece near the centre', () => {
    const at = defaultPlacement(0, small);
    expect(Math.abs(at.x)).toBeLessThanOrEqual(90);
    expect(Math.abs(at.z)).toBeLessThanOrEqual(90);
  });

  it('offsets later pieces so they do not stack exactly', () => {
    const spots = [0, 1, 2, 3].map((index) => defaultPlacement(index, small));
    const keys = new Set(spots.map((spot) => `${spot.x},${spot.z}`));
    expect(keys.size).toBe(4);
  });

  it('clamps a position to the workplane, keeping the footprint inside', () => {
    expect(clampPosition(9999, -9999, small)).toEqual({ x: 475, z: -494 });
    expect(clampPosition(0, 0, small)).toEqual({ x: 0, z: 0 });
  });

  it('centres a piece bigger than the workplane on that axis', () => {
    expect(clampPosition(100, 100, { x: 2000, y: 3, z: 10 })).toEqual({ x: 0, z: 100 });
  });

  it('creates a placed piece unrotated at its default spot', () => {
    const piece = createPlacedPiece('placed-1', 'girder-1x4', 0, small);
    expect(piece.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(piece.position).toEqual(defaultPlacement(0, small));
  });

  it('selects one piece on a plain click and toggles with Shift', () => {
    expect(toggleSelection([], 'a', false)).toEqual(['a']);
    expect(toggleSelection(['a'], 'b', false)).toEqual(['b']);
    expect(toggleSelection(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  });

  it('removes only the selected pieces', () => {
    const placed = [
      createPlacedPiece('p1', 'girder-1x4', 0, small),
      createPlacedPiece('p2', 'girder-1x6', 1, small),
    ];
    expect(removePlaced(placed, ['p1']).map((piece) => piece.id)).toEqual(['p2']);
    expect(removePlaced(placed, [])).toHaveLength(2);
  });
});

describe('pointerToWorkplane', () => {
  it('maps a screen point to the workplane plane', async () => {
    const { pointerToWorkplane } = await import('./pointer');
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
    camera.position.set(700, 700, 700);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // The centre of the screen looks straight at the workplane centre.
    const point = pointerToWorkplane(0, 0, camera);
    expect(point).not.toBeNull();
    expect(point?.x).toBeCloseTo(0);
    expect(point?.z).toBeCloseTo(0);
  });
});

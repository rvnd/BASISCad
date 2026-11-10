import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SPEC_PIECES } from '../app/library';
import { registerGeometry } from './libraryGeometry';
import { moveAssembly, rotateAssembly } from './assemblyEdits';
import type { PlacedPiece } from '../app/design';

const geometry = new THREE.BoxGeometry(4, 4, 4).translate(0, 2, 0);
registerGeometry('rigid-test', geometry);
const library = new Map([['box', { ...SPEC_PIECES[0]!, id: 'box', geometryId: 'rigid-test' }]]);
const piece = (id: string, x: number, z = 0, groupId?: string): PlacedPiece => ({
  id,
  libraryId: 'box',
  position: { x, y: 0, z },
  rotation: { x: 0, y: 0, z: 0 },
  ...(groupId ? { groupId } : {}),
});

describe('rigid motion collision validation', () => {
  it('still rejects an assembly whose members already overlap', () => {
    const placed = [piece('a', 0, 0, 'g'), piece('b', 2, 0, 'g')];
    expect(moveAssembly(placed, ['a'], { x: 50, y: 0, z: 0 }, library)).toBe(placed);
    expect(rotateAssembly(placed, ['a'], { x: 0, y: 90, z: 0 }, library)).toBe(placed);
  });
  it('checks external obstacles throughout the sweep even when both endpoints are clear', () => {
    const placed = [piece('a', -20, 0, 'g'), piece('b', 20, 0, 'g'), piece('fixed', 14, -14)];
    expect(rotateAssembly(placed, ['a'], { x: 0, y: 90, z: 0 }, library)).toBe(placed);
  });
});

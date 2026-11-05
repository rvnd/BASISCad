import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlacedPiece } from '../app/design';
import type { LibraryPiece } from '../app/library';
import { createDesignScene } from './designScene';
import { registerGeometry } from './libraryGeometry';

const small = { x: 50, y: 3, z: 12 };

function libraryPiece(id: string, geometryId: string | null): LibraryPiece {
  return {
    id,
    name: id,
    category: 'girders',
    colourName: 'White',
    colourHex: '#FFFFFF',
    holeCount: 4,
    sizeMm: small,
    source: 'spec',
    geometryId,
  };
}

describe('designScene', () => {
  it('adds one group per placed piece, at its position, and removes it again', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    registerGeometry('test-box', new THREE.BoxGeometry(50, 3, 12));
    const library = [libraryPiece('girder-1x4', 'test-box')];
    const placed = [createPlacedPiece('p1', 'girder-1x4', 0, small)];

    design.sync(placed, library, []);
    const group = scene.getObjectByName('design');
    expect(group?.children).toHaveLength(1);
    const object = group?.children[0];
    expect(object?.position.x).toBeCloseTo(placed[0]?.position.x ?? 0);
    expect(object?.position.z).toBeCloseTo(placed[0]?.position.z ?? 0);
    expect(object?.position.y).toBe(0);

    design.sync([], library, []);
    expect(group?.children).toHaveLength(0);
    design.dispose();
  });

  it('shows the red selection box only on selected pieces', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    registerGeometry('test-box-2', new THREE.BoxGeometry(50, 3, 12));
    const library = [libraryPiece('girder-1x4', 'test-box-2')];
    const placed = [
      createPlacedPiece('p1', 'girder-1x4', 0, small),
      createPlacedPiece('p2', 'girder-1x4', 1, small),
    ];
    design.sync(placed, library, ['p2']);
    const group = scene.getObjectByName('design');
    const first = group?.children[0]?.getObjectByName('piece-selection');
    const second = group?.children[1]?.getObjectByName('piece-selection');
    expect(first?.visible).toBe(false);
    expect(second?.visible).toBe(true);
    design.dispose();
  });

  it('keeps a piece rotation when it is synced again', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    registerGeometry('test-box-3', new THREE.BoxGeometry(50, 3, 12));
    const library = [libraryPiece('girder-1x4', 'test-box-3')];
    const placed = createPlacedPiece('p1', 'girder-1x4', 0, small);
    placed.rotation = { x: 0, y: 90, z: 0 };
    design.sync([placed], library, ['p1']);
    const group = scene.getObjectByName('design');
    expect(group?.children[0]?.rotation.y).toBeCloseTo(Math.PI / 2);
    // Syncing again (as a re-select would) keeps the rotation.
    design.sync([placed], library, ['p1']);
    expect(group?.children[0]?.rotation.y).toBeCloseTo(Math.PI / 2);
    design.dispose();
  });

  it('picks the piece under the pointer and nothing elsewhere', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    registerGeometry('test-box-4', new THREE.BoxGeometry(200, 3, 100));
    const library = [libraryPiece('girder-1x4', 'test-box-4')];
    const placed = createPlacedPiece('p1', 'girder-1x4', 0, { x: 200, y: 3, z: 100 });
    // Place it at the workplane centre for the pick test.
    placed.position = { x: 0, z: 0 };
    design.sync([placed], library, []);
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
    camera.position.set(700, 700, 700);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    expect(design.pick(0, 0, camera)).toBe('p1');
    expect(design.pick(0.9, 0.9, camera)).toBeNull();
    design.dispose();
  });
});

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

/**
 * A box fixture the way the loader leaves real geometry: footprint
 * centred on the origin, base sitting on y = 0.
 */
function testBox(width: number, height: number, depth: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

describe('designScene', () => {
  it('adds one group per placed piece, at its position, and removes it again', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    registerGeometry('test-box', testBox(50, 3, 12));
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
    registerGeometry('test-box-2', testBox(50, 3, 12));
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
    registerGeometry('test-box-3', testBox(50, 3, 12));
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
    registerGeometry('test-box-4', testBox(200, 3, 100));
    const library = [libraryPiece('girder-1x4', 'test-box-4')];
    const placed = createPlacedPiece('p1', 'girder-1x4', 0, { x: 200, y: 3, z: 100 });
    // Place it at the workplane centre for the pick test.
    placed.position = { x: 0, y: 0, z: 0 };
    design.sync([placed], library, []);
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
    camera.position.set(700, 700, 700);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    expect(design.pick(0, 0, camera)).toBe('p1');
    expect(design.pick(0.9, 0.9, camera)).toBeNull();
    design.dispose();
  });

  it('lifts a flipped piece so no part of it goes below the workplane', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    registerGeometry('test-box-5', testBox(50, 3, 12));
    const library = [libraryPiece('girder-1x4', 'test-box-5')];
    const placed = createPlacedPiece('p1', 'girder-1x4', 0, small);
    placed.rotation = { x: 180, y: 0, z: 0 };
    design.sync([placed], library, ['p1']);
    const group = scene.getObjectByName('design');
    const object = group?.children[0];
    // The 3 mm thick piece flipped over sits on the plane, not under it.
    expect(object?.position.y).toBeCloseTo(3);
    const mesh = object?.getObjectByName('piece-mesh');
    if (mesh !== undefined) {
      const box = new THREE.Box3().setFromObject(mesh);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.001);
    }
    design.dispose();
  });

  it('shows the rotation rings only for a single selected piece', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    registerGeometry('test-box-6', testBox(50, 3, 12));
    const library = [libraryPiece('girder-1x4', 'test-box-6')];
    const placed = [
      createPlacedPiece('p1', 'girder-1x4', 0, small),
      createPlacedPiece('p2', 'girder-1x4', 1, small),
    ];
    design.sync(placed, library, ['p1']);
    expect(scene.getObjectByName('rotation-rings')?.visible).toBe(true);
    design.sync(placed, library, ['p1', 'p2']);
    expect(scene.getObjectByName('rotation-rings')?.visible).toBe(false);
    design.sync(placed, library, []);
    expect(scene.getObjectByName('rotation-rings')?.visible).toBe(false);
    design.dispose();
  });
});

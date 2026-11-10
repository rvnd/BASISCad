import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGroup, toggleLock } from '../app/groups';
import { createPlacedPiece } from '../app/design';
import type { LibraryPiece } from '../app/library';
import { createDesignScene } from './designScene';
import { registerGeometry } from './libraryGeometry';
import { rotationHandleRadius } from './rotationHandles';

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

  it('shows the rotation handles only for a single selected piece in Rotate mode', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    registerGeometry('test-box-6', testBox(50, 3, 12));
    const library = [libraryPiece('girder-1x4', 'test-box-6')];
    const placed = [
      createPlacedPiece('p1', 'girder-1x4', 0, small),
      createPlacedPiece('p2', 'girder-1x4', 1, small),
    ];
    // Move mode (the default): no handles, even for a single selection.
    design.sync(placed, library, ['p1']);
    expect(scene.getObjectByName('rotation-handles')?.visible).toBe(false);
    // Rotate mode: handles show for one piece, not for two or none.
    design.setHandlesEnabled(true);
    design.sync(placed, library, ['p1']);
    expect(scene.getObjectByName('rotation-handles')?.visible).toBe(true);
    design.sync(placed, library, ['p1', 'p2']);
    expect(scene.getObjectByName('rotation-handles')?.visible).toBe(false);
    design.sync(placed, library, []);
    expect(scene.getObjectByName('rotation-handles')?.visible).toBe(false);
    design.dispose();
  });

  it('centres grouped handles on all members, picks their axes, and hides them when locked', () => {
    const scene = new THREE.Scene(),
      design = createDesignScene(scene);
    registerGeometry('group-handles', testBox(50, 3, 12));
    const library = [libraryPiece('stock', 'group-handles')];
    const placed = createGroup(
      [
        { ...createPlacedPiece('a', 'stock', 0, small), position: { x: -40, y: 0, z: 0 } },
        { ...createPlacedPiece('b', 'stock', 0, small), position: { x: 40, y: 0, z: 0 } },
      ],
      ['a', 'b'],
      'g',
    );
    design.sync(placed, library, ['a', 'b']);
    design.setHandlesEnabled(true);
    const handles = scene.getObjectByName('rotation-handles')!;
    expect(handles.visible).toBe(true);
    expect(handles.position.x).toBeCloseTo(0);
    expect(handles.position.y).toBeCloseTo(1.5);
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
    camera.position.set(200, 250, 200);
    camera.lookAt(handles.position);
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    for (const axis of ['x', 'y', 'z'] as const) {
      const knob = scene.getObjectByName(`rotation-handle-knob-${axis}`)!;
      const point = knob.getWorldPosition(new THREE.Vector3()).project(camera);
      expect(design.handleHit(point.x, point.y, camera)?.axis).toBe(axis);
    }
    expect(design.positionOf('a')).toEqual({ x: 0, z: 0 });
    design.sync(toggleLock(placed, ['b']), library, ['a', 'b']);
    expect(handles.visible).toBe(false);
    design.dispose();
  });

  it('shows the handles the moment Rotate mode is entered, without another sync', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    registerGeometry('test-box-7', testBox(50, 3, 12));
    const library = [libraryPiece('girder-1x4', 'test-box-7')];
    const placed = [createPlacedPiece('p1', 'girder-1x4', 0, small)];
    // Sync once in Move mode: no handles.
    design.sync(placed, library, ['p1']);
    expect(scene.getObjectByName('rotation-handles')?.visible).toBe(false);
    // Enter Rotate mode with no further sync: the handles must appear
    // at once. (The old ring code only re-ran on sync, so the rings
    // stayed hidden until the piece was dragged once.)
    design.setHandlesEnabled(true);
    expect(scene.getObjectByName('rotation-handles')?.visible).toBe(true);
    // Leaving Rotate mode hides them again, also with no sync.
    design.setHandlesEnabled(false);
    expect(scene.getObjectByName('rotation-handles')?.visible).toBe(false);
    design.dispose();
  });

  it('maps each handle knob to its own axis only', () => {
    const scene = new THREE.Scene();
    const design = createDesignScene(scene);
    const geometry = testBox(50, 3, 12);
    registerGeometry('test-box-8', geometry);
    const library = [libraryPiece('girder-1x4', 'test-box-8')];
    const placed = [createPlacedPiece('p1', 'girder-1x4', 0, small)];
    design.setHandlesEnabled(true);
    design.sync(placed, library, ['p1']);
    const handles = scene.getObjectByName('rotation-handles');
    expect(handles?.visible).toBe(true);
    geometry.computeBoundingSphere();
    expect(handles?.scale.x).toBeCloseTo(
      rotationHandleRadius(geometry.boundingSphere?.radius ?? 0),
      6,
    );
    const centre = handles?.position.clone() ?? new THREE.Vector3();
    const camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
    camera.position.set(centre.x + 700, centre.y + 700, centre.z + 700);
    camera.lookAt(centre);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    // Aim a pointer ray at each knob and check the hit is that knob's
    // axis — grabbing the red handle must only ever rotate about X,
    // and likewise for green/Y and blue/Z.
    for (const axis of ['x', 'y', 'z'] as const) {
      const knob = scene.getObjectByName(`rotation-handle-knob-${axis}`);
      expect(knob).toBeDefined();
      const world = new THREE.Vector3();
      knob?.getWorldPosition(world);
      const ndc = world.clone().project(camera);
      const hit = design.handleHit(ndc.x, ndc.y, camera);
      expect(hit?.placedId).toBe('p1');
      expect(hit?.axis).toBe(axis);
    }
    // Pointing at empty space near the piece grabs no handle.
    expect(design.handleHit(0.9, 0.9, camera)).toBeNull();
    design.dispose();
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import apuRackMount from '../../public/library/apu-rack-mount.stl?raw';
import pcBoardMount from '../../public/library/pc-board-mount.stl?raw';
import { createPlacedPiece } from '../app/design';
import type { LibraryPiece } from '../app/library';
import { createDesignScene } from './designScene';
import { registerGeometry } from './libraryGeometry';
import { parsePieceGeometry } from './loadPieceFile';
import { findVerticalThroughHoles, snapToAlignedHole } from './holeSnapping';

function loadStandIn(contents: string, file: string) {
  const bytes = new TextEncoder().encode(contents);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return parsePieceGeometry(buffer, file);
}

describe('hole detection and snapping', () => {
  it('detects the through-holes in bundled flat stand-ins', () => {
    const girder = loadStandIn(apuRackMount, 'apu-rack-mount.stl');
    const panel = loadStandIn(pcBoardMount, 'pc-board-mount.stl');
    expect(findVerticalThroughHoles(girder.geometry)).toHaveLength(5);
    expect(findVerticalThroughHoles(panel.geometry)).toHaveLength(7);
    girder.geometry.dispose();
    panel.geometry.dispose();
  });

  it('snaps the dragged hole to its nearest partner within 2 mm', () => {
    const a = {
      ...createPlacedPiece('a', 'beam', 0, { x: 20, y: 2, z: 10 }),
      position: { x: 0, y: 0, z: 0 },
    };
    const b = {
      ...createPlacedPiece('b', 'beam', 1, { x: 20, y: 2, z: 10 }),
      position: { x: 0, y: 0, z: 0 },
    };
    const result = snapToAlignedHole(
      'a',
      { x: 9, z: 0 },
      [a, b],
      new Map([
        ['a', [{ x: 0, z: 0 }]],
        ['b', [{ x: 10.5, z: 0 }]],
      ]),
    );
    expect(result).toEqual({ x: 10.5, z: 0, snapped: true });
  });

  it('does not snap when the nearest hole is outside the 2 mm tolerance', () => {
    const a = {
      ...createPlacedPiece('a', 'beam', 0, { x: 20, y: 2, z: 10 }),
      position: { x: 0, y: 0, z: 0 },
    };
    const b = {
      ...createPlacedPiece('b', 'beam', 1, { x: 20, y: 2, z: 10 }),
      position: { x: 0, y: 0, z: 0 },
    };
    const result = snapToAlignedHole(
      'a',
      { x: 7.9, z: 0 },
      [a, b],
      new Map([
        ['a', [{ x: 0, z: 0 }]],
        ['b', [{ x: 10, z: 0 }]],
      ]),
    );
    expect(result).toEqual({ x: 7.9, z: 0, snapped: false });
  });

  it('does not use vertical-hole snapping when either piece is tilted', () => {
    const a = {
      ...createPlacedPiece('a', 'beam', 0, { x: 20, y: 2, z: 10 }),
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 90, y: 0, z: 0 },
    };
    const b = {
      ...createPlacedPiece('b', 'beam', 1, { x: 20, y: 2, z: 10 }),
      position: { x: 0, y: 0, z: 0 },
    };
    expect(
      snapToAlignedHole(
        'a',
        { x: 9, z: 0 },
        [a, b],
        new Map([
          ['a', [{ x: 0, z: 0 }]],
          ['b', [{ x: 10.5, z: 0 }]],
        ]),
      ),
    ).toEqual({ x: 9, z: 0, snapped: false });
  });

  it('shows green markers for aligned imported holes and snaps in the scene', () => {
    const loaded = loadStandIn(apuRackMount, 'apu-rack-mount.stl');
    registerGeometry('hole-scene-test', loaded.geometry);
    const libraryPiece: LibraryPiece = {
      id: 'test-beam',
      name: 'Test Beam',
      category: 'girders',
      colourName: 'White',
      colourHex: '#FFFFFF',
      holeCount: 5,
      sizeMm: loaded.sizeMm,
      source: 'import',
      geometryId: 'hole-scene-test',
    };
    const makePiece = (id: string, x: number) => ({
      ...createPlacedPiece(id, libraryPiece.id, 0, loaded.sizeMm),
      position: { x, y: 0, z: 0 },
    });
    const moving = makePiece('moving', 0);
    const target = makePiece('target', 10);
    const root = new THREE.Scene();
    const scene = createDesignScene(root);
    scene.sync([moving, target], [libraryPiece], []);
    expect(scene.snapPosition('moving', 8.5, 0)).toEqual({ x: 10, z: 0, snapped: true });
    scene.sync([moving, makePiece('target', 0)], [libraryPiece], []);
    const markers = root.getObjectByName('aligned-hole-markers');
    expect(markers?.children.length).toBeGreaterThan(0);

    scene.dispose();
    loaded.geometry.dispose();
  });
});

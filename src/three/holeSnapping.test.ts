import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPlacedPiece } from '../app/design';
import type { LibraryPiece } from '../app/library';
import { createDesignScene } from './designScene';
import { registerGeometry } from './libraryGeometry';
import { parsePieceGeometry } from './loadPieceFile';
import { findVerticalThroughHoles, snapToAlignedHole } from './holeSnapping';

/**
 * Load a bundled library STL (binary — `?raw` imports would corrupt
 * it, since they round-trip through UTF-8 text) through the same
 * loader path the app uses for bundled pieces.
 */
function loadBundled(file: string) {
  const buffer = readFileSync(
    fileURLToPath(new URL(`../../public/library/${file}`, import.meta.url)),
  );
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return parsePieceGeometry(arrayBuffer, file, { assumeZUp: true });
}

describe('hole detection and snapping', () => {
  it('detects the through-holes in bundled flat pieces', () => {
    const girder = loadBundled('girder-1x6.stl');
    const panel = loadBundled('plate-2x2.stl');
    expect(findVerticalThroughHoles(girder.geometry)).toHaveLength(6);
    expect(findVerticalThroughHoles(panel.geometry)).toHaveLength(4);
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
    const loaded = loadBundled('girder-1x6.stl');
    registerGeometry('hole-scene-test', loaded.geometry);
    const libraryPiece: LibraryPiece = {
      id: 'test-beam',
      name: 'Test Beam',
      category: 'girders',
      colourName: 'White',
      colourHex: '#FFFFFF',
      holeCount: 6,
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

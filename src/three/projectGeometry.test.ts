import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { captureImportedAsset, restoreImportedAssets } from './projectGeometry';
import { getGeometry, registerGeometry } from './libraryGeometry';
import { parsePieceGeometry } from './loadPieceFile';
import { SPEC_PIECES } from '../app/library';
import { readFileSync } from 'node:fs';

describe('portable mesh geometry', () => {
  it('preserves all actual library meshes when used as custom imported parts', () => {
    for (const spec of SPEC_PIECES) {
      const bytes = readFileSync(`public/library/${spec.id}.stl`);
      const { geometry } = parsePieceGeometry(new Uint8Array(bytes).buffer, `${spec.id}.stl`, {
        assumeZUp: true,
      });
      const id = `custom-${spec.id}`;
      registerGeometry(id, geometry);
      const asset = captureImportedAsset({ ...spec, id, source: 'import', geometryId: id });
      const restored = restoreImportedAssets([asset])[0]!;
      expect(Array.from(restored.geometry.getAttribute('position').array)).toEqual(
        Array.from(geometry.getAttribute('position').array),
      );
      expect(Array.from(restored.geometry.getAttribute('normal').array)).toEqual(
        Array.from(geometry.getAttribute('normal').array),
      );
      expect(restored.piece.colourHex).toBe(spec.colourHex);
      restored.geometry.dispose();
    }
  });

  it('expands indexed geometry and rejects corrupt triangles without registering partial assets', () => {
    const id = 'portable-indexed';
    const geometry = new THREE.BoxGeometry(10, 3.175, 20);
    registerGeometry(id, geometry);
    const asset = captureImportedAsset({
      ...SPEC_PIECES[0]!,
      id,
      geometryId: id,
      source: 'import',
    });
    const restored = restoreImportedAssets([asset])[0]!;
    expect(restored.geometry.index).toBeNull();
    expect(restored.piece.sizeMm).toEqual({ x: 10, y: 3.174999952316284, z: 20 });
    for (const positions of ['!', btoa('short'), btoa('\x00\x00\x80\x7f'.repeat(9))])
      expect(() =>
        restoreImportedAssets([asset, { ...asset, id: 'never-registered', positions }]),
      ).toThrow();
    expect(getGeometry('never-registered')).toBeUndefined();
    expect(getGeometry(id)).toBe(geometry);
    restored.geometry.dispose();
  });
});

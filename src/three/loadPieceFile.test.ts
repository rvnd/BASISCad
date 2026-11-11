import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  isSupportedPieceFile,
  loadPieceGeometry,
  measureGeometry,
  orientFlat,
} from './loadPieceFile';
import { createPieceMesh, disposePieceMesh } from './pieces';

/**
 * A minimal ASCII STL: one right-angled triangle in the XY plane,
 * 10 mm on its legs. Enough to exercise the STL parse path without
 * shipping a real piece file.
 */
const TRIANGLE_STL = [
  'solid triangle',
  '  facet normal 0 0 1',
  '    outer loop',
  '      vertex 0 0 0',
  '      vertex 10 0 0',
  '      vertex 0 10 0',
  '    endloop',
  '  endfacet',
  'endsolid triangle',
  '',
].join('\n');

const QUAD_OBJ = [
  'o quad',
  'v 0 0 0',
  'v 10 0 0',
  'v 10 0 10',
  'v 0 0 10',
  'f 1 2 3',
  'f 1 3 4',
  '',
].join('\n');

function stlFile(contents: string): File {
  return new File([contents], 'test-piece.stl', { type: 'model/stl' });
}

function objFile(contents: string): File {
  return new File([contents], 'test-piece.obj', { type: 'model/obj' });
}

describe('loadPieceFile', () => {
  it('accepts .stl and .obj, rejects anything else', () => {
    expect(isSupportedPieceFile('piece.STL')).toBe(true);
    expect(isSupportedPieceFile('piece.obj')).toBe(true);
    expect(isSupportedPieceFile('piece.png')).toBe(false);
    expect(isSupportedPieceFile('piece')).toBe(false);
  });

  it('parses an ASCII STL, lays it flat, and keeps its original size', async () => {
    const loaded = await loadPieceGeometry(stlFile(TRIANGLE_STL));
    // The fixture triangle lies in the XY plane (Z-up, as 3D-printing
    // STLs usually are), so the loader lays it flat in XZ: 10 mm in x,
    // 10 mm in z, flat in y. Size is unchanged, only orientation moves.
    // (toBeCloseTo: the -90° rotation leaves ~1e-16 float residue.)
    expect(loaded.sizeMm.x).toBeCloseTo(10);
    expect(loaded.sizeMm.y).toBeCloseTo(0);
    expect(loaded.sizeMm.z).toBeCloseTo(10);
    const position = loaded.geometry.getAttribute('position');
    expect(position?.count).toBe(3);
  });

  it('normalises the STL position: footprint centred, lowest point on y = 0', async () => {
    const loaded = await loadPieceGeometry(stlFile(TRIANGLE_STL));
    loaded.geometry.computeBoundingBox();
    const box = loaded.geometry.boundingBox;
    expect(box).not.toBeNull();
    if (box !== null) {
      expect(box.min.y).toBe(0);
      expect(box.min.x).toBeCloseTo(-5);
      expect(box.max.x).toBeCloseTo(5);
    }
  });

  it('parses an OBJ and merges its faces', async () => {
    const loaded = await loadPieceGeometry(objFile(QUAD_OBJ));
    expect(loaded.sizeMm).toEqual({ x: 10, y: 0, z: 10 });
    const position = loaded.geometry.getAttribute('position');
    expect(position?.count).toBe(6);
  });

  it('rejects an unsupported file and an empty STL', async () => {
    const bad = new File(['hello'], 'piece.txt', { type: 'text/plain' });
    await expect(loadPieceGeometry(bad)).rejects.toThrow('Only .stl and .obj');
    await expect(loadPieceGeometry(stlFile('solid empty\nendsolid empty\n'))).rejects.toThrow();
  });

  it('measures a geometry from its bounding box', () => {
    const geometry = new THREE.BoxGeometry(20, 5, 10);
    expect(measureGeometry(geometry)).toEqual({ x: 20, y: 5, z: 10 });
    geometry.dispose();
  });

  it('rejects non-finite OBJ coordinates and normals before they can enter a design', async () => {
    for (const value of ['NaN', 'Infinity', '1e100']) {
      await expect(
        loadPieceGeometry(objFile(`v ${value} 0 0\nv 10 0 0\nv 0 0 10\nf 1 2 3\n`)),
      ).rejects.toThrow('invalid vertex');
    }
    await expect(
      loadPieceGeometry(objFile('v 0 0 0\nv 10 0 0\nv 0 0 10\nvn NaN 0 0\nf 1//1 2//1 3//1\n')),
    ).rejects.toThrow('invalid normals');
  });

  it('lays a Z-up geometry flat and leaves a flat one alone', () => {
    const zUp = new THREE.BoxGeometry(20, 10, 5);
    orientFlat(zUp);
    expect(measureGeometry(zUp)).toEqual({ x: 20, y: 5, z: 10 });
    zUp.dispose();
    const flat = new THREE.BoxGeometry(20, 5, 10);
    orientFlat(flat);
    expect(measureGeometry(flat)).toEqual({ x: 20, y: 5, z: 10 });
    flat.dispose();
  });

  it('rotates a Z-up brace flat only when assumeZUp is set', () => {
    // A brace stands up in Z: its bounding box is not thinnest along
    // Z, so the bounding-box heuristic alone leaves it on its side.
    // Bundled library pieces are known to be Z-up, so they pass
    // assumeZUp and always get the rotation.
    const brace = new THREE.BoxGeometry(31.54, 12.7, 31.54);
    orientFlat(brace);
    // BoxGeometry stores float32, so 31.54 comes back as 31.5400009… —
    // compare approximately.
    const flatSize = measureGeometry(brace);
    expect(flatSize.x).toBeCloseTo(31.54);
    expect(flatSize.y).toBeCloseTo(12.7);
    expect(flatSize.z).toBeCloseTo(31.54);
    orientFlat(brace, true);
    const size = measureGeometry(brace);
    expect(size.x).toBeCloseTo(31.54);
    expect(size.y).toBeCloseTo(31.54);
    expect(size.z).toBeCloseTo(12.7);
    brace.dispose();
  });
});

describe('pieces', () => {
  it('builds a mesh plus a black outline, sharing the geometry', () => {
    const geometry = new THREE.BoxGeometry(20, 5, 10);
    const group = createPieceMesh(geometry, '#FF7F00');
    const mesh = group.getObjectByName('piece-mesh');
    const outline = group.getObjectByName('piece-outline');
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(outline).toBeInstanceOf(THREE.LineSegments);
    if (mesh instanceof THREE.Mesh) {
      expect(mesh.geometry).toBe(geometry);
    }
    if (outline instanceof THREE.LineSegments) {
      const material = outline.material;
      if (!Array.isArray(material)) {
        expect((material as THREE.LineBasicMaterial).color.getHex()).toBe(0x000000);
      }
    }
    disposePieceMesh(group);
    // The shared geometry survives disposal — it belongs to the library.
    expect(geometry.getAttribute('position')?.count).toBeGreaterThan(0);
    geometry.dispose();
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SPEC_PIECES } from '../app/library';
import { parsePieceGeometry } from './loadPieceFile';

/**
 * The 17 bundled library STLs, validated through the app's own loader
 * path — the same `parsePieceGeometry` (with `assumeZUp: true`) the
 * app uses for bundled pieces. Each file must load, match its spec
 * size, have the right triangle count, be a watertight manifold whose
 * genus-derived hole count equals the spec hole count, and agree with
 * the holes.json sidecar the generator writes.
 */

const LIBRARY_DIR = fileURLToPath(new URL('../../public/library/', import.meta.url));

/** Triangle counts the generator reported for each bundled STL. */
const EXPECTED_TRIANGLES: Record<string, number> = {
  'girder-1x4': 1030,
  'girder-1x5': 1234,
  'girder-1x6': 1648,
  'girder-1x7': 1856,
  'girder-1x8': 2056,
  'girder-1x9': 2254,
  'girder-1x10': 2460,
  'girder-1x11': 2664,
  'girder-1x12': 2852,
  'brace-1x2': 1002,
  'brace-h': 1484,
  'brace-v': 1154,
  'brace-l': 1030,
  'brace-s': 628,
  'plate-team': 4076,
  'plate-2x2': 1368,
  'plate-2x3': 1638,
};

interface Hole {
  center: [number, number, number];
  axis: [number, number, number];
  radius: number;
}

const HOLES: Record<string, Hole[]> = JSON.parse(
  readFileSync(`${LIBRARY_DIR}holes.json`, 'utf-8'),
) as Record<string, Hole[]>;

/**
 * Genus and watertightness of a non-indexed triangle soup, from its
 * Euler characteristic: weld identical vertices, count unique edges,
 * genus = (2 - (V - E + F)) / 2. A solid with N through-holes has
 * genus N; watertight means every edge is shared by exactly 2 faces.
 *
 * Welding is on the exact float32 values, never rounded: the source
 * geometry has distinct vertices less than 0.001 mm apart (the 1x2
 * Brace has two such pairs), and rounding them together merges
 * different parts of the surface and breaks the topology.
 */
function meshTopology(geometry: THREE.BufferGeometry): { genus: number; watertight: boolean } {
  const position = geometry.getAttribute('position');
  const vertexIds = new Map<string, number>();
  const ids: number[] = [];
  const key = (i: number): string => `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
  for (let i = 0; i < position.count; i++) {
    const k = key(i);
    let id = vertexIds.get(k);
    if (id === undefined) {
      id = vertexIds.size;
      vertexIds.set(k, id);
    }
    ids.push(id);
  }
  const edgeCounts = new Map<string, number>();
  const faces = position.count / 3;
  for (let f = 0; f < faces; f++) {
    const corners: [number, number, number] = [
      ids[f * 3] ?? 0,
      ids[f * 3 + 1] ?? 0,
      ids[f * 3 + 2] ?? 0,
    ];
    for (const [u, v] of [
      [corners[0], corners[1]],
      [corners[1], corners[2]],
      [corners[2], corners[0]],
    ] as const) {
      const edge = u < v ? `${u}-${v}` : `${v}-${u}`;
      edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
    }
  }
  const euler = vertexIds.size - edgeCounts.size + faces;
  return {
    genus: (2 - euler) / 2,
    watertight: [...edgeCounts.values()].every((count) => count === 2),
  };
}

describe('bundled library STLs', () => {
  it('has a holes.json entry for every spec piece', () => {
    expect(Object.keys(HOLES).sort()).toEqual(SPEC_PIECES.map((piece) => piece.id).sort());
  });

  for (const piece of SPEC_PIECES) {
    it(`${piece.name}: loads, matches its spec size, and is a watertight ${piece.holeCount}-hole solid`, () => {
      expect(piece.bundledFile).toBeDefined();
      const file = piece.bundledFile?.file ?? '';
      // bundledFile.file is a path under public/, e.g. 'library/girder-1x4.stl'.
      const buffer = readFileSync(fileURLToPath(new URL(`../../public/${file}`, import.meta.url)));
      expect(buffer.byteLength).toBeGreaterThan(0);
      const loaded = parsePieceGeometry(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        file,
        { assumeZUp: true },
      );

      // Size matches the spec entry (within 0.05 mm — the spec entry
      // rounds the mesh's exact dimensions).
      expect(piece.sizeMm).not.toBeNull();
      if (piece.sizeMm !== null) {
        expect(loaded.sizeMm.x).toBeCloseTo(piece.sizeMm.x, 1);
        expect(loaded.sizeMm.y).toBeCloseTo(piece.sizeMm.y, 1);
        expect(loaded.sizeMm.z).toBeCloseTo(piece.sizeMm.z, 1);
      }

      // Triangle count matches what the generator produced.
      const position = loaded.geometry.getAttribute('position');
      expect(position.count / 3).toBe(EXPECTED_TRIANGLES[piece.id]);

      // Watertight manifold, and the genus-derived hole count equals
      // the spec hole count.
      const { genus, watertight } = meshTopology(loaded.geometry);
      expect(watertight).toBe(true);
      expect(genus).toBe(piece.holeCount);

      // The holes.json sidecar agrees: same count, axes on the unit
      // axes, hole radius clearing a #6 screw (3.505 mm across).
      const holes = HOLES[piece.id] ?? [];
      expect(holes).toHaveLength(piece.holeCount ?? 0);
      for (const hole of holes) {
        const axis = hole.axis;
        expect(axis.map(Math.abs).sort()).toEqual([0, 0, 1]);
        expect(hole.radius).toBeGreaterThan(3.505 / 2);
        expect(hole.radius).toBeLessThan(2.5);
      }
      loaded.geometry.dispose();
    });
  }
});

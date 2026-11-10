import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPlacedPiece } from '../app/design';
import { SPEC_PIECES } from '../app/library';
import { parseLibraryHoles } from '../app/libraryHoles';
import { parsePieceGeometry } from './loadPieceFile';
import {
  alignedHoleMarkers,
  holesAlign,
  snapToWorldHole,
  worldHolesForPiece,
} from './orientedHoles';
import { pieceMatrix, pieceQuaternion } from './pieceTransforms';

const catalog = parseLibraryHoles(
  JSON.parse(readFileSync(new URL('../../public/library/holes.json', import.meta.url), 'utf8')),
);

function load(id: string) {
  const bytes = readFileSync(new URL(`../../public/library/${id}.stl`, import.meta.url));
  const loaded = parsePieceGeometry(new Uint8Array(bytes).buffer, `${id}.stl`, { assumeZUp: true });
  const spec = SPEC_PIECES.find((piece) => piece.id === id)!;
  return { ...loaded, library: { ...spec, holes: catalog[id] } };
}

describe('oriented holes', () => {
  it.each(SPEC_PIECES.map((piece) => ({ id: piece.id, count: piece.holeCount })))(
    'measures all $count bores in $id from its real geometry',
    ({ id, count }) => {
      const { geometry, sizeMm, library } = load(id);
      const piece = {
        ...createPlacedPiece('piece', id, 0, sizeMm),
        position: { x: 0, y: 0, z: 0 },
      };
      const holes = worldHolesForPiece(piece, library, geometry);
      expect(holes).toHaveLength(count!);
      for (const hole of holes) {
        expect(hole.axis.length()).toBeCloseTo(1);
        expect(hole.entry.distanceTo(hole.exit)).toBeGreaterThan(3);
        expect(hole.entry.distanceTo(hole.exit)).toBeLessThan(3.4);
        // A ray down the bore must pass through empty space, not through its wall.
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
        );
        const ray = new THREE.Raycaster(
          hole.entry.clone().addScaledVector(hole.axis, -0.01),
          hole.axis,
          0,
          hole.entry.distanceTo(hole.exit) + 0.02,
        );
        expect(ray.intersectObject(mesh)).toHaveLength(0);
        mesh.material.dispose();
      }
      geometry.dispose();
    },
  );

  it.each([
    { x: 90, y: 0, z: 0 },
    { x: 0, y: 0, z: 90 },
    { x: 45, y: 30, z: 0 },
    { x: 180, y: 0, z: 0 },
  ])('aligns holes and orients rings after rotation $x/$y/$z', (rotation) => {
    const { geometry, sizeMm, library } = load('girder-1x6');
    const a = {
      ...createPlacedPiece('a', library.id, 0, sizeMm),
      position: { x: 0, y: 20, z: 0 },
      rotation,
    };
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(pieceQuaternion(rotation));
    const b = {
      ...a,
      id: 'b',
      position: { x: axis.x * sizeMm.y, y: 20 + axis.y * sizeMm.y, z: axis.z * sizeMm.y },
    };
    const holes = [
      ...worldHolesForPiece(a, library, geometry),
      ...worldHolesForPiece(b, library, geometry),
    ];
    expect(holesAlign(holes[0]!, holes[6]!)).toBe(true);
    const markers = alignedHoleMarkers(holes);
    expect(markers).toHaveLength(6);
    for (const marker of markers) expect(Math.abs(marker.axis.dot(axis))).toBeCloseTo(1);
    const proposed = Math.abs(axis.x) < 0.5 ? { x: 1, z: 0 } : { x: 0, z: 1 };
    const snap = snapToWorldHole(a, proposed, holes);
    expect(snap.snapped).toBe(true);
    const moved = { ...a, position: { x: snap.x, y: snap.y ?? a.position.y, z: snap.z } };
    expect(holesAlign(worldHolesForPiece(moved, library, geometry)[0]!, holes[6]!)).toBe(true);
    geometry.dispose();
  });

  it('corrects height for horizontal holes, respects the radial tolerance, and refuses perpendicular axes', () => {
    const { geometry, sizeMm, library } = load('girder-1x6');
    const a = {
      ...createPlacedPiece('a', library.id, 0, sizeMm),
      position: { x: 0, y: 10, z: 0 },
      rotation: { x: 90, y: 0, z: 0 },
    };
    const b = { ...a, id: 'b', position: { x: 0, y: 10.8, z: 5 } };
    const holes = [
      ...worldHolesForPiece(a, library, geometry),
      ...worldHolesForPiece(b, library, geometry),
    ];
    const snap = snapToWorldHole(a, { x: 1, z: 0 }, holes);
    expect(snap).toMatchObject({
      x: 0,
      z: 0,
      snapped: true,
    });
    expect(snap.y).toBeCloseTo(10.8);
    expect(snapToWorldHole(a, { x: 2, z: 0 }, holes).snapped).toBe(false);
    const perpendicular = worldHolesForPiece(
      { ...b, rotation: { x: 0, y: 0, z: 0 } },
      library,
      geometry,
    );
    expect(
      snapToWorldHole(a, { x: 0, z: 0 }, [...holes.slice(0, 6), ...perpendicular]).snapped,
    ).toBe(false);
    geometry.dispose();
  });

  it('keeps the normalized 1x11 bore positions along its long axis', () => {
    const holes = catalog['girder-1x11']!;
    expect(
      Math.max(...holes.map((hole) => hole.center.x)) -
        Math.min(...holes.map((hole) => hole.center.x)),
    ).toBeGreaterThan(120);
    expect(Math.max(...holes.map((hole) => Math.abs(hole.center.z)))).toBeLessThan(0.01);
  });

  it('places every rotated mesh vertex on or above its stored base height', () => {
    const { geometry, sizeMm, library } = load('brace-l');
    const piece = {
      ...createPlacedPiece('piece', library.id, 0, sizeMm),
      position: { x: 0, y: 12, z: 0 },
      rotation: { x: 39, y: 72, z: 141 },
    };
    const matrix = pieceMatrix(piece, geometry);
    const vertices = geometry.getAttribute('position');
    let min = Infinity;
    for (let i = 0; i < vertices.count; i += 1)
      min = Math.min(
        min,
        new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(matrix).y,
      );
    expect(min).toBeCloseTo(12);
    geometry.dispose();
  });
});

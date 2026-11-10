import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SPEC_PIECES } from '../app/library';
import { parsePieceGeometry } from './loadPieceFile';
import { rotatedGeometryBounds } from './geometryBounds';
import { pieceBounds } from './designConstraints';

describe('cached exact geometry bounds', () => {
  it('matches actual vertices for all 17 pieces at tilted and upright orientations', () => {
    for (const spec of SPEC_PIECES) {
      const bytes = readFileSync(`public/library/${spec.id}.stl`);
      const { geometry } = parsePieceGeometry(new Uint8Array(bytes).buffer, `${spec.id}.stl`, {
        assumeZUp: true,
      });
      for (const rotation of [
        { x: 0, y: 90, z: 0 },
        { x: 137, y: -44, z: 92 },
        { x: 45, y: 15, z: 25 },
      ]) {
        const quaternion = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            ...([rotation.x, rotation.y, rotation.z].map(THREE.MathUtils.degToRad) as [
              number,
              number,
              number,
            ]),
          ),
        );
        const expected = new THREE.Box3(),
          positions = geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++)
          expected.expandByPoint(
            new THREE.Vector3().fromBufferAttribute(positions, i).applyQuaternion(quaternion),
          );
        const actual = rotatedGeometryBounds(geometry, rotation);
        expect(actual.min.distanceTo(expected.min)).toBeLessThan(1e-10);
        expect(actual.max.distanceTo(expected.max)).toBeLessThan(1e-10);
        const position = { x: 401, y: 20, z: -309 };
        expected.translate(
          new THREE.Vector3(position.x, position.y + Math.max(0, -expected.min.y), position.z),
        );
        const translated = pieceBounds(
          { id: 'test', libraryId: spec.id, position, rotation },
          geometry,
        );
        expect(translated.min.distanceTo(expected.min)).toBeLessThan(1e-10);
        expect(translated.max.distanceTo(expected.max)).toBeLessThan(1e-10);
      }
    }
  });

  it('does not let caller edits corrupt cached boxes and invalidates changed attributes', () => {
    const geometry = new THREE.BoxGeometry(2, 4, 6),
      rotation = { x: 0, y: 0, z: 0 };
    const expected = rotatedGeometryBounds(geometry, rotation);
    rotatedGeometryBounds(geometry, rotation).translate(new THREE.Vector3(500, 500, 500));
    expect(rotatedGeometryBounds(geometry, rotation)).toEqual(expected);
    geometry.translate(10, 0, 0);
    expect(rotatedGeometryBounds(geometry, rotation).min.x).toBe(9);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-20, 0, 0, 20, 1, 2], 3));
    expect(rotatedGeometryBounds(geometry, rotation).min.x).toBe(-20);
    for (let angle = 0; angle < 200; angle++)
      rotatedGeometryBounds(geometry, { x: angle, y: angle, z: angle });
    expect(rotatedGeometryBounds(geometry, rotation).min.x).toBe(-20);
  });
});

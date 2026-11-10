import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { meshesOverlap } from './meshCollision';
import { parsePieceGeometry } from './loadPieceFile';
import { parseLibraryHoles } from '../app/libraryHoles';

const pose = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);

describe('closed-mesh collision', () => {
  it('distinguishes diagonal corner contact from a shallow penetration with overlapping bounds', () => {
    const box = new THREE.BoxGeometry(2, 2, 2);
    const rotation = new THREE.Matrix4().makeRotationY(Math.PI / 4);
    const contact = 1 + Math.SQRT1_2;
    for (const [offset, expected] of [
      [0, false],
      [0.001, false],
      [-0.001, true],
    ] as const) {
      rotation.setPosition(contact + offset, 0, contact + offset);
      expect(meshesOverlap(box, pose(), box, rotation)).toBe(expected);
      expect(meshesOverlap(box, rotation, box, pose())).toBe(expected);
    }
  });
  it('allows touching faces and edges, but detects partial overlap and containment', () => {
    const box = new THREE.BoxGeometry(10, 10, 10);
    expect(meshesOverlap(box, pose(), box, pose(10))).toBe(false);
    expect(meshesOverlap(box, pose(), box, pose(10, 10))).toBe(false);
    expect(meshesOverlap(box, pose(), box, pose(9.99))).toBe(true);
    expect(meshesOverlap(box, pose(), box, pose())).toBe(true);
    expect(meshesOverlap(box, pose(), new THREE.BoxGeometry(1, 1, 1), pose())).toBe(true);
  });

  it('detects crossing solids when neither solid has a vertex inside the other', () => {
    const bar = new THREE.BoxGeometry(30, 2, 2);
    const rotation = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    expect(meshesOverlap(bar, pose(), bar, rotation)).toBe(true);
    rotation.setPosition(0, 2, 0);
    expect(meshesOverlap(bar, pose(), bar, rotation)).toBe(false);
  });

  it('allows a piece in the empty centre of a concave solid', () => {
    const ring = new THREE.TorusGeometry(10, 2, 12, 32);
    const box = new THREE.BoxGeometry(2, 2, 2);
    expect(meshesOverlap(ring, pose(), box, pose())).toBe(false);
    expect(meshesOverlap(ring, pose(), box, pose(10))).toBe(true);
  });

  it('uses the actual girder bore rather than blocking its bounding box', () => {
    const bytes = readFileSync('public/library/girder-1x6.stl');
    const { geometry } = parsePieceGeometry(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      'girder.stl',
      { assumeZUp: true },
    );
    const catalog = parseLibraryHoles(
      JSON.parse(readFileSync('public/library/holes.json', 'utf8')),
    );
    const hole = catalog['girder-1x6']![0]!;
    const screw = new THREE.CylinderGeometry(1.75, 1.75, 10, 16);
    expect(
      meshesOverlap(geometry, pose(), screw, pose(hole.center.x, hole.center.y, hole.center.z)),
    ).toBe(false);
    expect(
      meshesOverlap(geometry, pose(), screw, pose(hole.center.x + 4, hole.center.y, hole.center.z)),
    ).toBe(true);
  });
});

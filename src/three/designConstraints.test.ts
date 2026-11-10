import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COLLISION_EPS_MM } from './meshCollision';
import type { PlacedPiece } from '../app/design';
import {
  canPlace,
  clampPiece,
  constrainDesignEdit,
  dragPiece,
  freePlacement,
  pieceBounds,
} from './designConstraints';

const box = new THREE.BoxGeometry(10, 10, 10).translate(0, 5, 0);
const geometry = () => box;
function piece(id: string, x = 0, y = 0, z = 0): PlacedPiece {
  return { id, libraryId: 'box', position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 } };
}

describe('design constraints', () => {
  it('rejects overlapping typed moves atomically and permits touching or stacking', () => {
    const a = piece('a');
    const b = piece('b', 20);
    const before = [a, b];
    expect(constrainDesignEdit(before, [a, piece('b', 9)], geometry)).toBe(before);
    expect(constrainDesignEdit(before, [a, piece('b', 10)], geometry)[1]!.position.x).toBe(10);
    expect(constrainDesignEdit(before, [a, piece('b', 0, 10)], geometry)[1]!.position.y).toBe(10);
  });

  it('clamps the actual rotated footprint and every vertex above the floor', () => {
    const long = new THREE.BoxGeometry(100, 3, 12).translate(0, 1.5, 0);
    const rotated = { ...piece('a', 490, -20, 490), rotation: { x: 70, y: 45, z: 20 } };
    const clamped = clampPiece(rotated, long);
    const bounds = pieceBounds(clamped, long);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(bounds.max.x).toBeLessThanOrEqual(500 + 1e-6);
    expect(bounds.max.z).toBeLessThanOrEqual(500 + 1e-6);
  });

  it('rejects a rotation whose sweep passes through another piece', () => {
    const bar = new THREE.BoxGeometry(40, 3, 4).translate(0, 1.5, 0);
    const small = new THREE.BoxGeometry(3, 3, 3).translate(0, 1.5, 0);
    const lookup = (p: PlacedPiece) => (p.id === 'a' ? bar : small);
    const before = [piece('a'), piece('b', 12, 0, -12)];
    const after = [{ ...before[0]!, rotation: { x: 0, y: 90, z: 0 } }, before[1]!];
    expect(canPlace(after[0]!, after, lookup)).toBe(true);
    expect(constrainDesignEdit(before, after, lookup)).toBe(before);
  });

  it('sweeps a fast drag, climbs the near wall, crosses the top, and descends beside the far wall', () => {
    const obstacle = piece('fixed');
    let moving = piece('moving', -25);
    let climbed = false;
    let crossed = false;
    for (let x = -24; x <= 45; x += 1) {
      moving = dragPiece(moving, { x, y: moving.position.y, z: 0 }, [obstacle], geometry, 0);
      expect(canPlace(moving, [obstacle], geometry)).toBe(true);
      climbed ||= moving.position.y > 0;
      crossed ||= moving.position.y >= 10 - COLLISION_EPS_MM * 2 && moving.position.x > 0;
    }
    expect(climbed).toBe(true);
    expect(crossed).toBe(true);
    expect(moving.position.y).toBe(0);
    expect(moving.position.x).toBeGreaterThan(10);
    const fast = dragPiece(piece('moving', -25), { x: 25, y: 0, z: 0 }, [obstacle], geometry, 0);
    expect(canPlace(fast, [obstacle], geometry)).toBe(true);
    expect(fast.position.x).toBeGreaterThan(10);
  });

  it('slides tangentially along a wall before climbing', () => {
    const obstacle = piece('fixed');
    const moving = piece('moving', -10);
    const next = dragPiece(moving, { x: -8, y: 0, z: 3 }, [obstacle], geometry, 0);
    expect(next.position.x).toBe(-10);
    expect(next.position.z).toBeCloseTo(3);
    expect(next.position.y).toBe(0);
  });

  it('rests on the actual support height rather than rounding to a drag step', () => {
    const thin = new THREE.BoxGeometry(10, 3.175, 10).translate(0, 3.175 / 2, 0);
    const lookup = () => thin;
    const fixed = piece('fixed');
    let moving = piece('moving', -20);
    for (let x = -19; x <= 0; x++)
      moving = dragPiece(moving, { x, y: moving.position.y, z: 0 }, [fixed], lookup, 0);
    expect(moving.position.y).toBeCloseTo(3.175, 4);
    expect(canPlace(moving, [fixed], lookup)).toBe(true);
  });

  it('places additional overlapping defaults at a free position', () => {
    const start = piece('new');
    const next = freePlacement(start, [piece('existing')], geometry)!;
    expect(next.position).not.toEqual(start.position);
    expect(canPlace(next, [piece('existing')], geometry)).toBe(true);
  });
});

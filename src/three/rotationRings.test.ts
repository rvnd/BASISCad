import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RING_ANGLE_SIGNS, ringAngleDeg, ringHit, unwrapAngleDelta } from './rotationRings';
import type { RotationAxis } from './rotationRings';

describe('ringAngleDeg', () => {
  it('moves with a real three.js rotation, with the documented sign', () => {
    const centre = new THREE.Vector3(10, 20, 30);
    const axes: { axis: RotationAxis; point: THREE.Vector3 }[] = [
      { axis: 'x', point: new THREE.Vector3(10, 120, 30) },
      { axis: 'y', point: new THREE.Vector3(110, 20, 30) },
      { axis: 'z', point: new THREE.Vector3(110, 20, 30) },
    ];
    for (const { axis, point } of axes) {
      const before = ringAngleDeg(axis, centre, point);
      const rotated = point
        .clone()
        .sub(centre)
        .applyAxisAngle(
          axis === 'x'
            ? new THREE.Vector3(1, 0, 0)
            : axis === 'y'
              ? new THREE.Vector3(0, 1, 0)
              : new THREE.Vector3(0, 0, 1),
          THREE.MathUtils.degToRad(30),
        )
        .add(centre);
      const after = ringAngleDeg(axis, centre, rotated);
      expect(unwrapAngleDelta(before, after)).toBeCloseTo(RING_ANGLE_SIGNS[axis] * 30, 6);
    }
  });
});

describe('unwrapAngleDelta', () => {
  it('takes the short way across the ±180 seam', () => {
    expect(unwrapAngleDelta(170, -170)).toBe(20);
    expect(unwrapAngleDelta(-170, 170)).toBe(-20);
    expect(unwrapAngleDelta(10, 40)).toBe(30);
    expect(unwrapAngleDelta(40, 10)).toBe(-30);
  });
});

describe('ringHit', () => {
  const centre = new THREE.Vector3(0, 0, 0);
  const radius = 100;

  it('grabs each ring through a point on it', () => {
    const cases: { axis: RotationAxis; point: THREE.Vector3; origin: THREE.Vector3 }[] = [
      // The X case starts off the x = 0 plane: a ray that lies inside
      // a ring's plane never intersects it.
      {
        axis: 'x',
        point: new THREE.Vector3(0, 70.7, 70.7),
        origin: new THREE.Vector3(50, 300, 300),
      },
      {
        axis: 'y',
        point: new THREE.Vector3(70.7, 0, 70.7),
        origin: new THREE.Vector3(0, 300, 300),
      },
      {
        axis: 'z',
        point: new THREE.Vector3(70.7, 70.7, 0),
        origin: new THREE.Vector3(0, 300, 300),
      },
    ];
    for (const { axis, point, origin } of cases) {
      const direction = point.clone().sub(origin).normalize();
      const ray = new THREE.Ray(origin, direction);
      expect(ringHit(centre, radius, ray)?.axis).toBe(axis);
    }
  });

  it('misses a ray that passes far from every ring', () => {
    const origin = new THREE.Vector3(0, 300, 300);
    const direction = new THREE.Vector3(0, 200, 0).sub(origin).normalize();
    expect(ringHit(centre, radius, new THREE.Ray(origin, direction))).toBeNull();
  });

  it('misses a ray parallel to a ring plane that never meets it', () => {
    const origin = new THREE.Vector3(0, 0, 300);
    const direction = new THREE.Vector3(1, 0, 0);
    expect(ringHit(centre, radius, new THREE.Ray(origin, direction))).toBeNull();
  });
});

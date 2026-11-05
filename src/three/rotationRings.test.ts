import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  RING_ANGLE_SIGNS,
  createRotationRings,
  ringAngleDeg,
  ringHit,
  ringLabelOffset,
  setRingHover,
  unwrapAngleDelta,
} from './rotationRings';
import type { RotationAxis } from './rotationRings';

describe('ringLabelOffset', () => {
  it('sits on its own ring, off the other rings, and away from the other labels', () => {
    const offsets: Record<RotationAxis, THREE.Vector3> = {
      x: ringLabelOffset('x'),
      y: ringLabelOffset('y'),
      z: ringLabelOffset('z'),
    };
    for (const axis of ['x', 'y', 'z'] as const) {
      // A unit direction from the centre, so it sits on the ring.
      expect(offsets[axis].length()).toBeCloseTo(1, 6);
      // On its own ring's plane: x is 0 on the YZ ring, y is 0 on XZ, z is 0 on XY.
      expect(offsets[axis][axis]).toBeCloseTo(0, 6);
    }
    // No two labels coincide: each pair is well apart.
    const axes: RotationAxis[] = ['x', 'y', 'z'];
    for (let i = 0; i < axes.length; i += 1) {
      for (let j = i + 1; j < axes.length; j += 1) {
        const a = axes[i];
        const b = axes[j];
        expect(offsets[a as RotationAxis].distanceTo(offsets[b as RotationAxis])).toBeGreaterThan(
          0.5,
        );
      }
    }
  });
});

describe('createRotationRings', () => {
  it('builds a ring, a knob, and a letter label per axis', () => {
    const group = createRotationRings();
    expect(group.visible).toBe(false);
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(group.getObjectByName(`rotation-ring-${axis}`)).toBeDefined();
      const knob = group.getObjectByName(`rotation-ring-knob-${axis}`);
      expect(knob).toBeDefined();
      // The knob sits on its ring, at the label point.
      expect(knob?.position.distanceTo(ringLabelOffset(axis))).toBeCloseTo(0, 6);
      const label = group.getObjectByName(`rotation-ring-label-${axis}`);
      expect(label).toBeDefined();
      expect(label).toBeInstanceOf(THREE.Sprite);
      // The label sits just outside the ring, past the knob.
      expect(label?.position.length()).toBeGreaterThan(1);
    }
  });
});

describe('setRingHover', () => {
  it('brightens and enlarges only the hovered ring, and clears on null', () => {
    const group = createRotationRings();
    const knobX = group.getObjectByName('rotation-ring-knob-x');
    const knobY = group.getObjectByName('rotation-ring-knob-y');
    const ringX = group.getObjectByName('rotation-ring-x') as THREE.Mesh;
    const material = ringX.material as THREE.MeshBasicMaterial;
    const baseRed = material.color.r;
    setRingHover(group, 'x');
    expect(knobX?.scale.x).toBeCloseTo(1.5, 6);
    expect(knobY?.scale.x).toBeCloseTo(1, 6);
    // Lightened towards white: the red channel is brighter than the base red.
    expect(material.color.r).toBeGreaterThan(baseRed);
    setRingHover(group, null);
    expect(knobX?.scale.x).toBeCloseTo(1, 6);
    expect(material.color.r).toBeCloseTo(baseRed, 6);
  });
});

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

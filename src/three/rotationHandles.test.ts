import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  HANDLE_ARC_DEG,
  HANDLE_AXIS_COLOURS,
  createProtractor,
  createRotationHandles,
  handleAngleDeg,
  handlePoint,
  handleTangent,
  hideProtractor,
  rotationHandleRadius,
  setHandleHover,
  showProtractor,
  snapDragDeltaDeg,
  unwrapAngleDelta,
  updateProtractorAngle,
} from './rotationHandles';
import type { RotationAxis } from './rotationHandles';

describe('handlePoint', () => {
  it('sits on its own axis plane, and the three handles never cross', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const { start, end } = HANDLE_ARC_DEG[axis];
      for (const angle of [start, (start + end) / 2, end]) {
        const point = handlePoint(axis, angle);
        expect(point.length()).toBeCloseTo(1, 6);
        // On its own plane: x is 0 for X, y is 0 for Y, z is 0 for Z.
        expect(point[axis]).toBeCloseTo(0, 6);
      }
    }
    // No two handles share a point: sample every arc densely.
    const samples: Record<RotationAxis, THREE.Vector3[]> = { x: [], y: [], z: [] };
    for (const axis of ['x', 'y', 'z'] as const) {
      const { start, end } = HANDLE_ARC_DEG[axis];
      for (let i = 0; i <= 40; i += 1) {
        samples[axis].push(handlePoint(axis, start + ((end - start) * i) / 40));
      }
    }
    const axes: RotationAxis[] = ['x', 'y', 'z'];
    for (let i = 0; i < axes.length; i += 1) {
      for (let j = i + 1; j < axes.length; j += 1) {
        const a = axes[i] as RotationAxis;
        const b = axes[j] as RotationAxis;
        let closest = Number.POSITIVE_INFINITY;
        for (const p of samples[a]) {
          for (const q of samples[b]) {
            closest = Math.min(closest, p.distanceTo(q));
          }
        }
        expect(closest).toBeGreaterThan(0.3);
      }
    }
  });
});

describe('handleTangent', () => {
  it('is a unit vector in the handle plane, perpendicular to the radius', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const { start, end } = HANDLE_ARC_DEG[axis];
      for (const angle of [start, (start + end) / 2, end]) {
        const tangent = handleTangent(axis, angle);
        const point = handlePoint(axis, angle);
        expect(tangent.length()).toBeCloseTo(1, 6);
        expect(tangent.dot(point)).toBeCloseTo(0, 6);
        expect(tangent[axis]).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('createRotationHandles', () => {
  it('builds an arc, an arrowhead, a knob, and a letter label per axis', () => {
    const group = createRotationHandles();
    expect(group.visible).toBe(false);
    for (const axis of ['x', 'y', 'z'] as const) {
      const { start, end } = HANDLE_ARC_DEG[axis];
      const arc = group.getObjectByName(`rotation-handle-arc-${axis}`);
      expect(arc).toBeDefined();
      expect(arc?.userData.handleAxis).toBe(axis);
      const arrow = group.getObjectByName(`rotation-handle-arrow-${axis}`);
      expect(arrow).toBeDefined();
      // The arrowhead sits at the arc's end, pointing along it.
      expect(arrow?.position.distanceTo(handlePoint(axis, end))).toBeCloseTo(0, 6);
      const knob = group.getObjectByName(`rotation-handle-knob-${axis}`);
      expect(knob).toBeDefined();
      // The knob sits at the arc's start.
      expect(knob?.position.distanceTo(handlePoint(axis, start))).toBeCloseTo(0, 6);
      const label = group.getObjectByName(`rotation-handle-label-${axis}`);
      expect(label).toBeDefined();
      expect(label).toBeInstanceOf(THREE.Sprite);
      const labelMaterial = (label as THREE.Sprite).material;
      expect(labelMaterial.transparent).toBe(true);
      expect(labelMaterial.opacity).toBe(1);
      expect(labelMaterial.depthWrite).toBe(true);
      // The label sits just outside the arc, past the knob.
      expect(label?.position.length()).toBeGreaterThan(1);
      // The arrowhead is clearly wider than the thin arc tube, so it
      // reads as an arrow first and a line second.
      const arcRadius = (arc as THREE.Mesh).geometry as THREE.TubeGeometry;
      const arrowGeometry = (arrow as THREE.Mesh).geometry as THREE.ConeGeometry;
      expect(arrowGeometry.parameters.radius).toBeGreaterThan(arcRadius.parameters.radius * 3);
      // An invisible, fatter hit tube along the same arc keeps the
      // thin line as easy to grab as the old thick one.
      const hit = group.getObjectByName(`rotation-handle-hit-${axis}`);
      expect(hit).toBeDefined();
      expect(hit?.userData.handleAxis).toBe(axis);
      const hitMaterial = (hit as THREE.Mesh).material as THREE.MeshBasicMaterial;
      expect(hitMaterial.transparent).toBe(true);
      expect(hitMaterial.opacity).toBe(0);
      // Every part of the handle carries its axis for picking.
      for (const part of [arc, arrow, knob, label, hit]) {
        expect(part?.userData.handleAxis).toBe(axis);
      }
    }
  });
});

describe('rotationHandleRadius', () => {
  it('keeps the inside of the knob at least 24 mm beyond the piece radius', () => {
    for (const pieceRadiusMm of [0, 50, 250]) {
      const arcRadius = rotationHandleRadius(pieceRadiusMm);
      const knobInnerRadius = arcRadius * 0.9;
      expect(knobInnerRadius - pieceRadiusMm).toBeCloseTo(24, 6);
    }
  });
});

describe('setHandleHover', () => {
  it('fades handles until hovered, then brightens them and restores the idle fade on null', () => {
    const group = createRotationHandles();
    const knobX = group.getObjectByName('rotation-handle-knob-x');
    const knobY = group.getObjectByName('rotation-handle-knob-y');
    const labelX = group.getObjectByName('rotation-handle-label-x') as THREE.Sprite;
    const arcX = group.getObjectByName('rotation-handle-arc-x') as THREE.Mesh;
    const arrowX = group.getObjectByName('rotation-handle-arrow-x') as THREE.Mesh;
    const knobMaterial = (knobX as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const arrowMaterial = arrowX.material as THREE.MeshBasicMaterial;
    const material = arcX.material as THREE.MeshBasicMaterial;
    const labelMaterial = labelX.material;
    const baseColour = new THREE.Color(HANDLE_AXIS_COLOURS.x);
    expect(material.transparent).toBe(false);
    expect(material.color.equals(baseColour)).toBe(false);
    expect(arrowMaterial.color.equals(material.color)).toBe(true);
    expect(knobMaterial.color.equals(material.color)).toBe(true);
    expect(material.opacity).toBe(1);
    expect(arrowMaterial.opacity).toBe(1);
    expect(knobMaterial.opacity).toBe(1);
    expect(labelMaterial.opacity).toBe(1);
    setHandleHover(group, 'x');
    expect(knobX?.scale.x).toBeCloseTo(1.5, 6);
    expect(knobY?.scale.x).toBeCloseTo(1, 6);
    expect(material.opacity).toBe(1);
    expect(arrowMaterial.opacity).toBe(1);
    expect(knobMaterial.opacity).toBe(1);
    expect(labelMaterial.opacity).toBe(1);
    expect(material.color.equals(baseColour)).toBe(true);
    setHandleHover(group, null);
    expect(knobX?.scale.x).toBeCloseTo(1, 6);
    expect(material.color.equals(baseColour)).toBe(false);
  });
});

describe('handleAngleDeg', () => {
  it('moves with a real three.js rotation, with the documented sign', () => {
    const centre = new THREE.Vector3(10, 20, 30);
    const axes: { axis: RotationAxis; point: THREE.Vector3 }[] = [
      { axis: 'x', point: new THREE.Vector3(10, 120, 30) },
      { axis: 'y', point: new THREE.Vector3(110, 20, 30) },
      { axis: 'z', point: new THREE.Vector3(110, 20, 30) },
    ];
    for (const { axis, point } of axes) {
      const before = handleAngleDeg(axis, centre, point);
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
      const after = handleAngleDeg(axis, centre, rotated);
      expect(unwrapAngleDelta(before, after)).toBeCloseTo(30, 6);
    }
  });
});

describe('snapDragDeltaDeg', () => {
  it('snaps to 22.5° inside the protractor circle, 1° outside, 45° with Shift', () => {
    // Inside: at or within the radius.
    expect(snapDragDeltaDeg(30, 50, 100, false)).toBe(22.5);
    expect(snapDragDeltaDeg(30, 100, 100, false)).toBe(22.5);
    expect(snapDragDeltaDeg(-30, 0, 100, false)).toBe(-22.5);
    expect(snapDragDeltaDeg(17, 10, 100, false)).toBe(22.5);
    // Outside: free in 1° steps.
    expect(snapDragDeltaDeg(30.4, 150, 100, false)).toBe(30);
    expect(snapDragDeltaDeg(30.6, 150, 100, false)).toBe(31);
    expect(snapDragDeltaDeg(-30.4, 200, 100, false)).toBe(-30);
    // Shift: 45° steps wherever the pointer is.
    expect(snapDragDeltaDeg(30, 50, 100, true)).toBe(45);
    expect(snapDragDeltaDeg(30, 150, 100, true)).toBe(45);
    expect(snapDragDeltaDeg(10, 50, 100, true)).toBe(0);
    expect(snapDragDeltaDeg(-30, 50, 100, true)).toBe(-45);
  });
});

describe('protractor', () => {
  it('shows in the dragged axis plane with ticks and a live angle readout', () => {
    const group = createProtractor();
    expect(group.visible).toBe(false);
    const centre = new THREE.Vector3(10, 20, 30);
    showProtractor(group, 'x', centre, 100, 45);
    expect(group.visible).toBe(true);
    expect(group.position.equals(centre)).toBe(true);
    expect(group.scale.x).toBeCloseTo(100);
    // The X protractor lies in the YZ plane: its rotation turns XY into YZ.
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(group.getObjectByName('rotation-protractor-circle')).toBeDefined();
    expect(group.getObjectByName('rotation-protractor-ticks')).toBeDefined();
    const label = group.getObjectByName('rotation-protractor-label') as THREE.Sprite;
    // The readout names its axis, so a drag can never be mistaken for
    // another axis — and it is large: twice as wide as tall, matching
    // its 2:1 canvas, and bigger than the old 0.5 uniform scale.
    expect(label.userData.labelText).toBe('X 45°');
    expect(label.scale.x).toBeCloseTo(1.8);
    expect(label.scale.y).toBeCloseTo(0.9);
    updateProtractorAngle(group, 'x', -30);
    expect(label.userData.labelText).toBe('X -30°');
    updateProtractorAngle(group, 'z', 90);
    expect(label.userData.labelText).toBe('Z 90°');
    hideProtractor(group);
    expect(group.visible).toBe(false);
  });
});

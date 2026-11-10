import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { tabletAxisProjection } from './tabletProjection';
import { axisDragDelta } from '../app/tabletControls';

describe('camera-aware tablet movement', () => {
  it('keeps top-view X/Z directions and gives end-on height an upward drag', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
    camera.position.set(0, 1400, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const position = { x: 0, y: 0, z: 0 };
    const x = tabletAxisProjection(camera, 800, 800, position, 'x');
    const y = tabletAxisProjection(camera, 800, 800, position, 'y');
    const z = tabletAxisProjection(camera, 800, 800, position, 'z');
    expect(x.x).toBeGreaterThan(0);
    expect(Math.abs(x.y)).toBeLessThan(1e-10);
    expect(y.x).toBe(0);
    expect(y.y).toBeLessThan(0);
    expect(Math.abs(z.x)).toBeLessThan(1e-10);
    expect(z.y).toBeGreaterThan(0);
    expect(axisDragDelta({ x: 0, y: -50 }, y)).toBeGreaterThan(0);
    camera.position.multiplyScalar(0.5);
    camera.updateMatrixWorld();
    const zoomed = tabletAxisProjection(camera, 800, 800, position, 'y');
    expect(zoomed.y).toBeCloseTo(y.y * 2);
  });
});

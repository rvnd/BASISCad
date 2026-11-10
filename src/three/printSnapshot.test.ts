import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { framePrintCamera, printCamera, PRINT_VIEWS } from './printSnapshot';
describe('print camera framing', () => {
  it('frames every corner of a distant tall design in all four views', () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(200, 0, -300),
      new THREE.Vector3(450, 300, -100),
    );
    for (const view of PRINT_VIEWS) {
      const camera = printCamera(bounds, 700, 770);
      framePrintCamera(camera, bounds, view.id, 700, 770);
      camera.updateMatrixWorld();
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(camera);
            expect(Math.abs(p.x)).toBeLessThan(1);
            expect(Math.abs(p.y)).toBeLessThan(1);
            expect(p.z).toBeGreaterThan(-1);
            expect(p.z).toBeLessThan(1);
          }
    }
  });
});

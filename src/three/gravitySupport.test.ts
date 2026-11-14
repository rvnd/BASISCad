import { describe, expect, it } from 'vitest';
import { supportedByFloor } from './gravitySupport';

describe('gravity floor support', () => {
  const feet = [-0.1, 0, -0.1, 0.1, 0, -0.1, 0.1, 0, 0.1, -0.1, 0, 0.1];
  it('recognizes a centre of mass inside actual contacts, including a tall balanced piece', () => {
    expect(supportedByFloor(feet, { x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: 0 })).toBe(true);
    expect(supportedByFloor(feet, { x: 0.2, y: 0, z: 0 }, { x: 0.2, y: 0.2, z: 0 })).toBe(true);
  });
  it('keeps hovering, overhanging, edge-balanced and unsupported pieces active', () => {
    expect(supportedByFloor(feet, { x: 0, y: 0.002, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(false);
    expect(supportedByFloor(feet, { x: 0, y: 0, z: 0 }, { x: 0.11, y: 1, z: 0 })).toBe(false);
    expect(supportedByFloor(feet, { x: 0, y: 0, z: 0 }, { x: 0.1, y: 1, z: 0 })).toBe(false);
    expect(supportedByFloor(feet, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })).toBe(false);
    expect(
      supportedByFloor(
        [0, 0, -0.1, 0, 0, 0, 0, 0, 0.1],
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ),
    ).toBe(false);
  });
});

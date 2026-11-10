import { describe, expect, it } from 'vitest';
import { parseLibraryHoles } from './libraryHoles';

describe('hole metadata', () => {
  it('normalizes a valid axis and preserves the recovered center and radius', () => {
    expect(
      parseLibraryHoles({ beam: [{ center: [1, 2, 3], axis: [0, -2, 0], radius: 2.098 }] }),
    ).toEqual({
      beam: [{ center: { x: 1, y: 2, z: 3 }, axis: { x: 0, y: -1, z: 0 }, radius: 2.098 }],
    });
  });
  it('discards invalid centers, axes, radii, and catalog entries', () => {
    expect(parseLibraryHoles(null)).toEqual({});
    expect(
      parseLibraryHoles({
        invalid: 'data',
        beam: [
          null,
          { center: [NaN, 0, 0], axis: [0, 1, 0], radius: 2 },
          { center: [0, 0, 0], axis: [0, 0, 0], radius: 2 },
          { center: [0, 0, 0], axis: [0, 1, 0], radius: -1 },
        ],
      }),
    ).toEqual({ beam: [] });
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PlacedPiece } from '../app/design';
import type { LibraryPiece } from '../app/library';
import { registerGeometry } from './libraryGeometry';
import { projectBlueprintLabels } from './blueprintLabels';
const piece: PlacedPiece = {
  id: 'a',
  libraryId: 'box',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
};
registerGeometry('labels-box', new THREE.BoxGeometry(50, 3, 12).translate(0, 1.5, 0));
const library = new Map<string, LibraryPiece>([
  [
    'box',
    {
      id: 'box',
      name: 'Test Girder',
      category: 'girders',
      colourName: 'White',
      colourHex: '#fff',
      holeCount: 4,
      sizeMm: { x: 50, y: 3, z: 12 },
      source: 'spec',
      geometryId: 'labels-box',
    },
  ],
]);
function camera() {
  const c = new THREE.PerspectiveCamera(45, 1, 1, 2000);
  c.position.set(0, 200, 0);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}
describe('blueprint projections', () => {
  it('projects names with leaders, avoids overlapping default labels, and hides requested labels', () => {
    const c = camera(),
      stock = [piece, { ...piece, id: 'b', position: { x: 0, y: 3, z: 0 } }];
    const labels = projectBlueprintLabels(stock, library, c, 800, 800, 'names');
    expect(labels).toHaveLength(2);
    expect(labels[0]!.name).toBe('Test Girder');
    expect(labels[0]!.position).not.toEqual(labels[0]!.anchor);
    expect(Math.abs(labels[0]!.position.y - labels[1]!.position.y)).toBeGreaterThanOrEqual(25);
    expect(
      projectBlueprintLabels(
        [{ ...piece, label: { hidden: true } }],
        library,
        c,
        800,
        800,
        'names',
      ),
    ).toEqual([]);
    expect(projectBlueprintLabels(stock, library, c, 800, 800, 'off')).toEqual([]);
  });
  it('separates dimension text for overlapping layers without changing their measurement endpoints', () => {
    const labels = projectBlueprintLabels(
      [piece, { ...piece, id: 'b', position: { x: 0, y: 3, z: 0 } }],
      library,
      camera(),
      800,
      800,
      'measurements',
    );
    const dimensions = labels.flatMap((label) => label.dimensions);
    for (let i = 0; i < dimensions.length; i++)
      for (let j = i + 1; j < dimensions.length; j++) {
        expect(
          Math.abs(dimensions[i]!.textAt.x - dimensions[j]!.textAt.x) >= 75 ||
            Math.abs(dimensions[i]!.textAt.y - dimensions[j]!.textAt.y) >= 22,
        ).toBe(true);
      }
    expect(dimensions.map((d) => d.text)).toEqual([
      'X 50.0 mm',
      'Y 3.0 mm',
      'Z 12.0 mm',
      'X 50.0 mm',
      'Y 3.0 mm',
      'Z 12.0 mm',
    ]);
  });
  it('keeps a saved screen offset relative to a moving piece and follows the camera', () => {
    const c = camera(),
      saved = { ...piece, label: { offset: { x: 90, y: -60 }, hidden: false } };
    const a = projectBlueprintLabels([saved], library, c, 800, 800, 'names')[0]!;
    const b = projectBlueprintLabels(
      [{ ...saved, position: { x: 20, y: 0, z: 0 } }],
      library,
      c,
      800,
      800,
      'names',
    )[0]!;
    expect(b.position.x - b.anchor.x).toBeCloseTo(90);
    expect(b.position.y - b.anchor.y).toBeCloseTo(-60);
    expect(b.position.x).toBeGreaterThan(a.position.x);
    c.position.set(200, 200, 200);
    c.lookAt(0, 0, 0);
    const orbit = projectBlueprintLabels([saved], library, c, 800, 800, 'names')[0]!;
    expect(orbit.position.x - orbit.anchor.x).toBeCloseTo(90);
  });
  it('measures actual world bounds on all axes, with readable end-on dimensions and extension lines', () => {
    const labels = projectBlueprintLabels([piece], library, camera(), 800, 800, 'measurements');
    expect(labels[0]!.dimensions.map((d) => d.text)).toEqual([
      'X 50.0 mm',
      'Y 3.0 mm',
      'Z 12.0 mm',
    ]);
    for (const dimension of labels[0]!.dimensions) {
      expect(
        Math.hypot(dimension.end.x - dimension.start.x, dimension.end.y - dimension.start.y),
      ).toBeGreaterThanOrEqual(10);
      expect(dimension.start).not.toEqual(dimension.fromStart);
    }
    const rotated = projectBlueprintLabels(
      [{ ...piece, rotation: { x: 0, y: 90, z: 0 } }],
      library,
      camera(),
      800,
      800,
      'measurements',
    );
    expect(rotated[0]!.dimensions.map((d) => d.text)).toEqual([
      'X 12.0 mm',
      'Y 3.0 mm',
      'Z 50.0 mm',
    ]);
  });
});

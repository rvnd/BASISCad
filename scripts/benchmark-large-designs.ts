import { writeFileSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { performanceDesign, loadFixtureLibrary } from './designFixtures';
import { canPlace, dragPiece, geometryLookup, pieceBounds } from '../src/three/designConstraints';
import { createPieceMesh, disposePieceMesh } from '../src/three/pieces';
import { rotateAssembly, selectionPose } from '../src/three/assemblyEdits';
import { alignedFastenerTargets } from '../src/three/fastening';

const started = performance.now();
const library = loadFixtureLibrary(),
  geometry = geometryLookup(library);
const loadMs = performance.now() - started;
const rows: {
  items: number;
  operation: string;
  firstMs: number;
  medianMs: number;
  maxMs: number;
  samples: number;
}[] = [];
for (const count of [2, 20, 50, 100]) {
  const placed = performanceDesign(count, library),
    probe = placed.find((entry) => entry.id === 'probe')!;
  if (!placed.every((entry) => canPlace(entry, placed, geometry)))
    throw new Error(`Invalid ${count}-item fixture`);
  for (const entry of placed) {
    const bounds = pieceBounds(entry, geometry(entry)!);
    if (
      Math.max(
        Math.abs(bounds.min.x),
        Math.abs(bounds.max.x),
        Math.abs(bounds.min.z),
        Math.abs(bounds.max.z),
      ) > 500
    )
      throw new Error('Fixture exceeds the workplane.');
  }
  const measure = (operation: string, run: () => unknown) => {
    const first = performance.now();
    run();
    const firstMs = performance.now() - first;
    const times = Array.from({ length: 7 }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    }).sort((a, b) => a - b);
    rows.push({
      items: count,
      operation,
      firstMs,
      medianMs: times[3]!,
      maxMs: times[6]!,
      samples: 7,
    });
  };
  measure('Create scene meshes', () => {
    const meshes = placed
      .filter((entry) => !entry.fastener)
      .map((entry) => createPieceMesh(geometry(entry)!, library.get(entry.libraryId)!.colourHex));
    meshes.forEach(disposePieceMesh);
  });
  measure('Sweep a free piece 40 mm', () =>
    dragPiece(probe, { ...probe.position, x: 440 }, placed, geometry, 0),
  );
  measure('Find aligned screw targets', () => alignedFastenerTargets(placed, library));
  if (count > 2) {
    const pose = selectionPose(placed, ['group-stock-0'], library)!;
    measure('Rotate screwed group 22.5 degrees', () =>
      rotateAssembly(placed, ['group-stock-0'], { ...pose.rotation, y: 22.5 }, library),
    );
  }
}
const report = {
  runtime: process.version,
  platform: platform(),
  cpu: cpus()[0]?.model,
  loadMs,
  rows,
};
console.table(
  rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'number' ? Number(value.toFixed(2)) : value,
      ]),
    ),
  ),
);
writeFileSync(
  `tmp/performance/${process.argv[2] || 'large'}.json`,
  JSON.stringify(report, null, 2) + '\n',
);

import { readFileSync, writeFileSync } from 'node:fs';
import { SPEC_PIECES } from '../src/app/library';
import { parseLibraryHoles } from '../src/app/libraryHoles';
import { parsePieceGeometry } from '../src/three/loadPieceFile';
import { registerGeometry } from '../src/three/libraryGeometry';
import { dragPiece, geometryLookup, pieceBounds } from '../src/three/designConstraints';
import { rotateAssembly } from '../src/three/assemblyEdits';
import { connectPieces } from '../src/three/connectPieces';
import { alignedFastenerTargets, fastenStack } from '../src/three/fastening';
import type { PlacedPiece } from '../src/app/design';

const catalog = parseLibraryHoles(JSON.parse(readFileSync('public/library/holes.json', 'utf8')));
const library = new Map(
  SPEC_PIECES.map((piece) => {
    const bytes = readFileSync(`public/library/${piece.id}.stl`);
    const loaded = parsePieceGeometry(new Uint8Array(bytes).buffer, `${piece.id}.stl`, {
      assumeZUp: true,
    });
    registerGeometry(piece.id, loaded.geometry);
    return [
      piece.id,
      { ...piece, geometryId: piece.id, sizeMm: loaded.sizeMm, holes: catalog[piece.id] },
    ] as const;
  }),
);
const geometry = geometryLookup(library);
const grid: PlacedPiece[] = Array.from({ length: 20 }, (_, i) => ({
  id: `piece-${i}`,
  libraryId: 'girder-1x6',
  position: { x: -360 + (i % 5) * 180, y: 0, z: -360 + Math.floor(i / 5) * 240 },
  rotation: { x: 0, y: 0, z: 0 },
}));
const tilted = { ...grid[12]!, rotation: { x: 45, y: 15, z: 25 } };
const stock = [
  { ...grid[0]!, id: 'base', position: { x: 0, y: 10, z: 0 } },
  { ...grid[0]!, id: 'arm', position: { x: 0, y: 13.175, z: 0 } },
];
const assembly = fastenStack(stock, library, { pieceId: 'base', holeIndex: 0 }, 'screw')!.map(
  (piece) => ({ ...piece, groupId: 'assembly', groupRotation: { x: 0, y: 0, z: 0 } }),
);
const reports: { name: string; medianMs: number; maxMs: number }[] = [];
function measure(name: string, run: () => unknown) {
  run();
  const times = Array.from({ length: 5 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  reports.push({
    name,
    medianMs: Number(times[2]!.toFixed(2)),
    maxMs: Number(times[4]!.toFixed(2)),
  });
}
measure('2000 translated bounds at one tilted orientation', () => {
  for (let i = 0; i < 2000; i++)
    pieceBounds({ ...tilted, position: { ...tilted.position, x: i / 10 } }, geometry(tilted)!);
});
measure('200 mm drag across an obstacle in a 20-piece design', () =>
  dragPiece(grid[12]!, { x: 200, y: 0, z: 120 }, grid, geometry, 0),
);
measure('90 degree Z rotation of a screwed group', () =>
  rotateAssembly(assembly, ['base'], { x: 0, y: 0, z: 90 }, library),
);
measure('Connect holes in a 20-piece design', () =>
  connectPieces(
    grid,
    library,
    [{ pieceId: 'piece-12', holeIndex: 2 }],
    [{ pieceId: 'piece-13', holeIndex: 3 }],
    { x: 0, y: 1400, z: 0 },
  ),
);
measure('Find screw targets in a 20-piece design', () => alignedFastenerTargets(grid, library));
console.table(reports);
writeFileSync(
  `tmp/performance/${process.argv[2] || 'current'}.json`,
  JSON.stringify(reports, null, 2) + '\n',
);

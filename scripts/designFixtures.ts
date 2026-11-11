import { readFileSync } from 'node:fs';
import { SPEC_PIECES } from '../src/app/library';
import type { LibraryPiece } from '../src/app/library';
import type { PlacedPiece } from '../src/app/design';
import { parseLibraryHoles } from '../src/app/libraryHoles';
import { parsePieceGeometry } from '../src/three/loadPieceFile';
import { registerGeometry } from '../src/three/libraryGeometry';
import { fastenStack } from '../src/three/fastening';
import { swingPiece } from '../src/three/assemblyEdits';
import { createGroup } from '../src/app/groups';

export function loadFixtureLibrary(): ReadonlyMap<string, LibraryPiece> {
  const catalog = parseLibraryHoles(JSON.parse(readFileSync('public/library/holes.json', 'utf8')));
  return new Map(
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
}

function piece(id: string, libraryId: string, x: number, y: number, z: number): PlacedPiece {
  return { id, libraryId, position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 } };
}

function joints(library: ReadonlyMap<string, LibraryPiece>): readonly PlacedPiece[] {
  let group: readonly PlacedPiece[] = Array.from({ length: 4 }, (_, i) =>
    piece(`group-stock-${i}`, 'girder-1x6', -210, i * 3.175, -240),
  );
  for (const [index, holeIndex] of [0, 2, 4].entries()) {
    const next = fastenStack(
      group,
      library,
      { pieceId: 'group-stock-0', holeIndex },
      `group-screw-${index}`,
    );
    if (!next) throw new Error('Could not prepare the reference screwed group.');
    group = next;
  }
  group = createGroup(group, ['group-stock-0', 'group-stock-1'], 'classroom-group');
  const hinge = fastenStack(
    [
      piece('hinge-base', 'girder-1x6', 230, 0, -240),
      piece('hinge-arm', 'girder-1x6', 230, 3.175, -240),
    ],
    library,
    { pieceId: 'hinge-base', holeIndex: 0 },
    'hinge-screw',
  );
  if (!hinge) throw new Error('Could not prepare the reference hinge.');
  return [...group, ...swingPiece(hinge, 'hinge-arm', 90, library)];
}

export function performanceDesign(
  count: number,
  library: ReadonlyMap<string, LibraryPiece>,
): readonly PlacedPiece[] {
  const probe = piece('probe', 'girder-1x4', 400, 0, 350);
  if (count === 2) return [piece('obstacle', 'girder-1x4', 400, 0, 400), probe];
  const result = [...joints(library)];
  const catalog = [
    ...SPEC_PIECES.filter((entry) => entry.id !== 'girder-1x6'),
    SPEC_PIECES.find((entry) => entry.id === 'girder-1x6')!,
  ];
  let x = -470,
    z = -70,
    rowDepth = 0;
  while (result.length < count - 1) {
    const spec = catalog[(result.length - 10) % catalog.length]!;
    const size = library.get(spec.id)!.sizeMm!;
    if (x + size.x > 470) {
      x = -470;
      z += rowDepth + 12;
      rowDepth = 0;
    }
    result.push(piece(`stock-${result.length}`, spec.id, x + size.x / 2, 0, z + size.z / 2));
    x += size.x + 12;
    rowDepth = Math.max(rowDepth, size.z);
  }
  result.push(probe);
  return result;
}

export function classroomDesign(
  library: ReadonlyMap<string, LibraryPiece>,
): readonly PlacedPiece[] {
  return performanceDesign(27, library).map((entry) => ({ ...entry, label: { hidden: false } }));
}

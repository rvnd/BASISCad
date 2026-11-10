import { readFileSync } from 'node:fs';
import type { PlacedPiece } from '../src/app/design';
import { SPEC_PIECES } from '../src/app/library';
import { parseLibraryHoles } from '../src/app/libraryHoles';
import { parsePieceGeometry } from '../src/three/loadPieceFile';
import { registerGeometry } from '../src/three/libraryGeometry';
import { fastenStack } from '../src/three/fastening';
import { swingPiece } from '../src/three/assemblyEdits';
import { canonicalAxis, designHoles, worldHole } from '../src/three/connectionHoles';

/** Real library stock and screws, positioned to exercise a 90 degree hinge connection. */
export function hingeDesign(): readonly PlacedPiece[] {
  const id = 'girder-1x6';
  const spec = SPEC_PIECES.find((piece) => piece.id === id)!;
  const bytes = readFileSync(new URL(`../public/library/${id}.stl`, import.meta.url));
  const loaded = parsePieceGeometry(new Uint8Array(bytes).buffer, `${id}.stl`, { assumeZUp: true });
  registerGeometry(id, loaded.geometry);
  const catalog = parseLibraryHoles(
    JSON.parse(readFileSync(new URL('../public/library/holes.json', import.meta.url), 'utf8')),
  );
  const library = new Map([
    [id, { ...spec, geometryId: id, sizeMm: loaded.sizeMm, holes: catalog[id] }],
  ]);
  const piece = (pieceId: string, y: number): PlacedPiece => ({
    id: pieceId,
    libraryId: id,
    position: { x: 0, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  });
  const initial = [piece('base', 10), piece('arm', 13.175)];
  const holes = designHoles(initial, library);
  const pivot = worldHole(holes, { pieceId: 'arm', holeIndex: 0 })!;
  const moving = worldHole(holes, { pieceId: 'arm', holeIndex: 4 })!;
  const destination = moving.center
    .clone()
    .sub(pivot.center)
    .applyAxisAngle(canonicalAxis(pivot.axis), Math.PI / 2)
    .add(pivot.center);
  const target = piece('target', 10);
  const bore = worldHole(designHoles([target], library), { pieceId: 'target', holeIndex: 4 })!;
  target.position.x += destination.x - bore.center.x;
  target.position.z += destination.z - bore.center.z;
  const under = { ...target, id: 'target-under', position: { ...target.position, y: 6.825 } };
  const a = fastenStack(initial, library, { pieceId: 'base', holeIndex: 0 }, 'pivot')!;
  const b = fastenStack(
    [target, under],
    library,
    { pieceId: 'target', holeIndex: 0 },
    'target-unit',
  )!;
  return [...a, ...b.map((entry) => ({ ...entry, locked: true }))];
}

export function jointLibrary() {
  const id = 'girder-1x6';
  const spec = SPEC_PIECES.find((piece) => piece.id === id)!;
  const catalog = parseLibraryHoles(
    JSON.parse(readFileSync(new URL('../public/library/holes.json', import.meta.url), 'utf8')),
  );
  return new Map([[id, { ...spec, geometryId: id, holes: catalog[id] }]]);
}

export function jointDesign(fixed = false, cross = false): readonly PlacedPiece[] {
  const initial = hingeDesign().filter((piece) => ['base', 'arm', 'pivot'].includes(piece.id));
  const library = jointLibrary();
  return fixed
    ? fastenStack(initial, library, { pieceId: 'base', holeIndex: 1 }, 'second')!
    : cross
      ? swingPiece(initial, 'arm', 90, library)
      : initial;
}

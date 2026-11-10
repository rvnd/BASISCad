import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PlacedPiece } from '../app/design';
import { SPEC_PIECES } from '../app/library';
import { parseLibraryHoles } from '../app/libraryHoles';
import { registerGeometry } from './libraryGeometry';
import { parsePieceGeometry } from './loadPieceFile';
import { connectPieces } from './connectPieces';
import {
  canonicalAxis,
  designHoles,
  holeStack,
  projectHoleTargets,
  worldHole,
} from './connectionHoles';
import { holesAlign } from './orientedHoles';
import { canPlace, geometryLookup } from './designConstraints';
import { fastenStack } from './fastening';
import { pieceMatrix } from './pieceTransforms';

const catalog = parseLibraryHoles(
  JSON.parse(readFileSync(new URL('../../public/library/holes.json', import.meta.url), 'utf8')),
);
const library = new Map(
  SPEC_PIECES.filter((piece) => piece.id === 'girder-1x6' || piece.id === 'girder-1x4').map(
    (piece) => {
      const bytes = readFileSync(new URL(`../../public/library/${piece.id}.stl`, import.meta.url));
      const loaded = parsePieceGeometry(new Uint8Array(bytes).buffer, `${piece.id}.stl`, {
        assumeZUp: true,
      });
      registerGeometry(piece.id, loaded.geometry);
      return [
        piece.id,
        { ...piece, geometryId: piece.id, sizeMm: loaded.sizeMm, holes: catalog[piece.id] },
      ] as const;
    },
  ),
);
const geometry = geometryLookup(library);
const piece = (id: string, x = 0, y = 0, z = 0): PlacedPiece => ({
  id,
  libraryId: 'girder-1x6',
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0 },
});
const ref = (pieceId: string, holeIndex = 0) => ({ pieceId, holeIndex });
const camera = { x: 0, y: 600, z: 200 };
const clear = (placed: readonly PlacedPiece[]) => {
  for (const entry of placed) expect(canPlace(entry, placed, geometry)).toBe(true);
};

describe('pick two holes to connect', () => {
  it.each([
    { x: 90, y: 0, z: 0 },
    { x: 0, y: 0, z: 90 },
    { x: 45, y: 30, z: 20 },
  ])('connects a bore at orientation $x/$y/$z without moving its target', (rotation) => {
    const before = [piece('moving', -100), { ...piece('target', 100, 40), rotation }];
    const result = connectPieces(before, library, [ref('moving', 2)], [ref('target', 3)], camera)!;
    expect(result).not.toBeNull();
    clear(result.placed);
    expect(result.placed[1]).toBe(before[1]);
    const holes = designHoles(result.placed, library);
    expect(
      holesAlign(worldHole(holes, ref('moving', 2))!, worldHole(holes, ref('target', 3))!),
    ).toBe(true);
  });

  it('moves the whole connected assembly only when that option is enabled', () => {
    const assembly = (name: string, x: number) => {
      const a = fastenStack(
        [piece(`${name}-a`, x, 10), piece(`${name}-b`, x, 13.175)],
        library,
        ref(`${name}-a`, 0),
        `${name}-s1`,
      )!;
      return fastenStack(a, library, ref(`${name}-a`, 1), `${name}-s2`)!;
    };
    const a = assembly('left', -100),
      b = assembly('right', 100),
      before = [...a, ...b];
    expect(
      connectPieces(before, library, [ref('left-a', 3)], [ref('right-a', 3)], camera),
    ).toBeNull();
    const result = connectPieces(before, library, [ref('left-a', 3)], [ref('right-a', 3)], camera, {
      eitherSide: true,
      moreAngles: true,
      moveAssembly: true,
    })!;
    expect(result).not.toBeNull();
    clear(result.placed);
    for (const entry of b) expect(result.placed.find((piece) => piece.id === entry.id)).toBe(entry);
    const movedA = result.placed.find((piece) => piece.id === 'left-a')!,
      movedB = result.placed.find((piece) => piece.id === 'left-b')!;
    expect(movedA.position.y - movedB.position.y).toBeCloseTo(-3.175, 4);
    const transform = pieceMatrix(movedA, geometry(movedA)!).multiply(
      pieceMatrix(a[0]!, geometry(a[0]!)!).invert(),
    );
    for (const original of a) {
      const moved = result.placed.find((piece) => piece.id === original.id)!;
      const expected = transform
        .clone()
        .multiply(pieceMatrix(original, geometry(original)!)).elements;
      pieceMatrix(moved, geometry(moved)!).elements.forEach((value, i) =>
        expect(value).toBeCloseTo(expected[i]!, 5),
      );
    }
  });
  it('joins real bores from the camera side and leaves the target exactly fixed', () => {
    const before = [piece('a', -100), piece('b', 100)];
    const result = connectPieces(before, library, [ref('a', 2)], [ref('b', 4)], camera)!;
    expect(result).not.toBeNull();
    clear(result.placed);
    expect(result.placed[1]).toBe(before[1]);
    expect(result.placed[0]!.position.y).toBeCloseTo(3.175, 4);
    const holes = designHoles(result.placed, library);
    expect(holesAlign(worldHole(holes, ref('a', 2))!, worldHole(holes, ref('b', 4))!)).toBe(true);
    expect(result.extendedFastener).toBe(false);
  });

  it('treats a group without screws as unattached and keeps locked targets selectable', () => {
    const a = { ...piece('a', -100), groupId: 'group' },
      b = { ...piece('b', 100), locked: true };
    const c = { ...piece('c', -200), groupId: 'group' };
    const result = connectPieces([a, b, c], library, [ref('a')], [ref('b')], camera)!;
    expect(result).not.toBeNull();
    expect(result.placed[1]).toBe(b);
    expect(result.placed[2]).toBe(c);
    const refused = connectPieces(
      [{ ...a, locked: true }, b, c],
      library,
      [ref('a')],
      [ref('b')],
      camera,
    );
    expect(refused).toBeNull();
  });

  it('tries the next clear layer when another piece occupies the first one', () => {
    const before = [piece('moving', -100), piece('target'), piece('obstacle', 0, 3.175)];
    const result = connectPieces(before, library, [ref('moving')], [ref('target')], camera)!;
    expect(result).not.toBeNull();
    clear(result.placed);
    expect(result.placed[0]!.position.y).toBeCloseTo(6.35, 4);
    expect(result.placed[1]).toBe(before[1]);
    expect(result.placed[2]).toBe(before[2]);
  });

  it('adds a paired screw, permits adjacent screws, and refuses duplicate hardware', () => {
    let placed: readonly PlacedPiece[] = [piece('a'), piece('b', 0, 3.175)];
    placed = fastenStack(placed, library, ref('a', 2), 'screw-1')!;
    expect(placed).not.toBeNull();
    clear(placed);
    expect(placed.at(-1)!.fastener!.lengthInches).toBe(0.375);
    const snapshot = placed;
    expect(fastenStack(placed, library, ref('a', 2), 'duplicate')).toBe(snapshot);
    const neighbouring = connectPieces(
      placed,
      library,
      [ref('a', 3), ref('b', 3)],
      [ref('a', 3), ref('b', 3)],
      camera,
    )!;
    expect(neighbouring.placed).toBe(placed);
    placed = fastenStack(placed, library, ref('a', 3), 'screw-2')!;
    expect(placed).not.toBeNull();
    clear(placed);
    expect(placed.filter((entry) => entry.fastener)).toHaveLength(2);
  });

  it('moves the free piece when the first pick belongs to a screwed assembly', () => {
    const fixed = fastenStack(
      [piece('base', 0, 10), piece('top', 0, 13.175)],
      library,
      ref('base', 0),
      'unit',
    )!;
    expect(fixed).not.toBeNull();
    const before = [...fixed, piece('free', -100)];
    const result = connectPieces(before, library, [ref('top', 3)], [ref('free', 3)], camera)!;
    expect(result).not.toBeNull();
    clear(result.placed);
    expect(result.movingId).toBe('free');
    for (let i = 0; i < fixed.length; i++) expect(result.placed[i]).toBe(fixed[i]);
    expect(result.placed.at(-1)!.position.y).toBeCloseTo(6.825, 3);
  });

  it('extends an occupied joint to three layers without moving its existing stock', () => {
    const fixed = fastenStack(
      [piece('base', 0, 10), piece('top', 0, 13.175)],
      library,
      ref('base', 0),
      'unit',
    )!;
    const result = connectPieces(
      [...fixed, piece('free', -100)],
      library,
      [ref('free')],
      [ref('top')],
      camera,
    )!;
    expect(result).not.toBeNull();
    clear(result.placed);
    expect(result.extendedFastener).toBe(true);
    const hardware = result.placed.find((entry) => entry.id === 'unit')!;
    expect(hardware.fastener!.holes).toHaveLength(3);
    expect(hardware.fastener!.lengthInches).toBe(0.5);
    expect(result.placed.find((entry) => entry.id === 'base')).toBe(fixed[0]);
    expect(result.placed.find((entry) => entry.id === 'top')).toBe(fixed[1]);
  });

  it('rejects floor violations and can retry the opposite camera side', () => {
    const before = [{ ...piece('base'), locked: true }, piece('free', -100)];
    const below = { x: 0, y: -600, z: 200 };
    expect(connectPieces(before, library, [ref('free', 3)], [ref('base', 3)], below)).toBeNull();
    const result = connectPieces(before, library, [ref('free', 3)], [ref('base', 3)], below, {
      eitherSide: true,
      moreAngles: true,
      moveAssembly: false,
    })!;
    expect(result).not.toBeNull();
    clear(result.placed);
  });

  it('swings a singly screwed piece to its second connection while both assemblies stay fixed', () => {
    const initial = [piece('base', 0, 10), piece('arm', 0, 13.175)];
    const pivot = worldHole(designHoles(initial, library), ref('arm', 0))!;
    const source = worldHole(designHoles(initial, library), ref('arm', 4))!;
    const destination = source.center
      .clone()
      .sub(pivot.center)
      .applyAxisAngle(canonicalAxis(pivot.axis), Math.PI / 2)
      .add(pivot.center);
    const target = piece('target', 200, 10, 200);
    const targetHole = worldHole(designHoles([target], library), ref('target', 4))!;
    target.position.x += destination.x - targetHole.center.x;
    target.position.z += destination.z - targetHole.center.z;
    let before = fastenStack(initial, library, ref('base', 0), 'pivot')!;
    const targetTop = { ...target, id: 'target-top', position: { ...target.position, y: 6.825 } };
    const targetAssembly = fastenStack(
      [target, targetTop],
      library,
      ref('target', 0),
      'target-unit',
    )!;
    before = [...before, ...targetAssembly];
    const result = connectPieces(before, library, [ref('arm', 4)], [ref('target', 4)], camera)!;
    expect(result).not.toBeNull();
    clear(result.placed);
    for (const entry of before)
      if (entry.id !== 'arm')
        expect(result.placed.find((item) => item.id === entry.id)).toBe(entry);
    expect(Math.abs(result.placed.find((entry) => entry.id === 'arm')!.rotation.y)).toBeCloseTo(90);
    const twice = fastenStack(result.placed, library, ref('arm', 4), 'second')!;
    expect(twice).not.toBeNull();
    expect(connectPieces(twice, library, [ref('arm', 3)], [ref('target', 3)], camera)).toBeNull();
  });
});

describe('connection markers', () => {
  it('groups aligned holes, shows occupied and locked holes, and separates projected neighbours', () => {
    const placed = fastenStack(
      [piece('a'), { ...piece('b', 0, 3.175), locked: false }],
      library,
      ref('a', 0),
      'unit',
    )!;
    const locked = placed.map((entry) => (entry.id === 'b' ? { ...entry, locked: true } : entry));
    const holes = designHoles(locked, library);
    const view = new THREE.PerspectiveCamera(45, 1, 1, 2000);
    view.position.set(0, 100, 200);
    view.lookAt(0, 0, 0);
    view.updateMatrixWorld();
    const targets = projectHoleTargets(holes, locked, library, view, 400, 400);
    expect(targets).toHaveLength(6);
    expect(targets[0]!.members).toHaveLength(2);
    expect(targets.some((entry) => entry.occupied)).toBe(true);
    expect(
      targets.every((entry) => entry.title.includes('hole') && entry.title.includes('piece')),
    ).toBe(true);
    for (let i = 0; i < targets.length; i++)
      for (let j = i + 1; j < targets.length; j++)
        expect(
          Math.hypot(targets[i]!.x - targets[j]!.x, targets[i]!.y - targets[j]!.y),
        ).toBeGreaterThanOrEqual(15);
  });

  it('does not fasten separated layers just because their infinite bore axes align', () => {
    const holes = designHoles([piece('a'), piece('b', 0, 30)], library);
    expect(holeStack(holes, ref('a', 0))).toHaveLength(1);
    expect(fastenStack([piece('a'), piece('b', 0, 30)], library, ref('a'), 'unit')).toBeNull();
  });
});

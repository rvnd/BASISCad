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
import { alignedFastenerTargets, fastenStack } from './fastening';
import { pieceMatrix } from './pieceTransforms';
import { createDesignScene } from './designScene';

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

describe('automatic fastening', () => {
  it('picks the visible nut through the broad hit areas of decorative stock outlines and hidden selection boxes', () => {
    const placed = fastenStack(
      [piece('a', 0, 10), piece('b', 0, 13.175)],
      library,
      ref('a'),
      'unit',
    )!;
    const unit = placed.at(-1)!;
    const scene = new THREE.Scene(),
      design = createDesignScene(scene);
    design.sync(placed, [...library.values()], []);
    scene.updateMatrixWorld(true);
    const target = new THREE.Vector3(unit.position.x, unit.position.y + 1, unit.position.z + 3.8);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    camera.position
      .copy(target)
      .add(new THREE.Vector3(0, 250, 1400).normalize().multiplyScalar(500));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(), camera);
    const first = ray.intersectObjects(scene.getObjectByName('design')!.children, true)[0]!;
    expect(first.object).toBeInstanceOf(THREE.LineSegments);
    expect(design.pick(0, 0, camera)).toBe('unit');
    design.dispose();
  });
  it.each([3, 4])(
    'chooses a half-inch paired fastener for %i layers without changing the stock',
    (layers) => {
      const stock = Array.from({ length: layers }, (_, i) =>
        piece(`layer-${i}`, 0, 10 + i * 3.175),
      );
      const targets = alignedFastenerTargets(stock, library);
      expect(targets).toHaveLength(6);
      expect(targets[0]!.layers).toBe(layers);
      const result = fastenStack(stock, library, ref('layer-0'), 'unit')!;
      expect(result).not.toBeNull();
      clear(result);
      expect(result.at(-1)!.fastener!.lengthInches).toBe(0.5);
      expect(result.at(-1)!.fastener!.holes).toHaveLength(layers);
      for (let i = 0; i < stock.length; i++) expect(result[i]).toBe(stock[i]);
      expect(alignedFastenerTargets(result, library)).toHaveLength(5);
    },
  );

  it('aligns the free layers to a locked anchor even when the user picked the free layer', () => {
    const locked = { ...piece('fixed', 0, 10), locked: true },
      free = piece('free', 1, 13.175);
    const result = fastenStack([locked, free], library, ref('free', 2), 'unit')!;
    expect(result).not.toBeNull();
    clear(result);
    expect(result[0]).toBe(locked);
    expect(result[1]!.position.x).toBeCloseTo(0, 5);
    const holes = designHoles(result, library);
    const a = worldHole(holes, ref('fixed', 2))!,
      b = worldHole(holes, ref('free', 2))!;
    expect(a.center.x).toBeCloseTo(b.center.x, 5);
  });
  it('lets Yes override shaft clearance in an aligned locked stack without moving either piece', () => {
    const stock = [
      { ...piece('a', 0, 10), locked: true },
      { ...piece('b', 1, 13.175), locked: true },
    ];
    expect(fastenStack(stock, library, ref('a'), 'unit')).toBeNull();
    const result = fastenStack(stock, library, ref('a'), 'unit', true)!;
    expect(result).not.toBeNull();
    expect(result[0]).toBe(stock[0]);
    expect(result[1]).toBe(stock[1]);
    expect(result.at(-1)!.fastener!.clearanceOverride).toBe(true);
    expect(fastenStack(result, library, ref('a', 1), 'adjacent', true)).not.toBeNull();
  });

  it('records a requested clearance override, permits the next screw, and keeps stock collisions and the floor mandatory', () => {
    const stock = [piece('a', 0, 10), piece('b', 0, 13.175)];
    const bore = worldHole(designHoles(stock, library), ref('a'))!;
    registerGeometry('block', new THREE.BoxGeometry(18, 2, 18).translate(0, 1, 0));
    const withBlock = new Map(library);
    withBlock.set('block', {
      ...library.get('girder-1x6')!,
      id: 'block',
      geometryId: 'block',
      holes: [],
    });
    const blocker = (id: string, y: number): PlacedPiece => ({
      ...piece(id, bore.center.x, y),
      libraryId: 'block',
    });
    const before = [...stock, blocker('above', 16.35), blocker('below', 8)];
    const lookup = geometryLookup(withBlock);
    for (const entry of before) expect(canPlace(entry, before, lookup)).toBe(true);
    expect(fastenStack(before, withBlock, ref('a'), 'unit')).toBeNull();
    const forced = fastenStack(before, withBlock, ref('a'), 'unit', true)!;
    expect(forced).not.toBeNull();
    expect(forced.at(-1)!.fastener!.clearanceOverride).toBe(true);
    expect(fastenStack(forced, withBlock, ref('a', 1), 'next', true)).not.toBeNull();
    expect(canPlace({ ...forced.at(-1)!, position: { x: 0, y: -100, z: 0 } }, forced, lookup)).toBe(
      false,
    );
    expect(canPlace({ ...stock[0]!, id: 'overlap' }, forced, lookup)).toBe(false);
  });
});

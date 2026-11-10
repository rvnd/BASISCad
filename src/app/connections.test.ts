import { describe, expect, it } from 'vitest';
import type { PlacedPiece } from './design';
import { removePlaced } from './design';
import {
  attachedPieceIds,
  fastenersAtPiece,
  hingeFastener,
  holeHasFastener,
  isFastenerConnection,
} from './connections';
import { readRecoveryDraft, writeRecoveryDraft } from './projects';

const piece = (id: string): PlacedPiece => ({
  id,
  libraryId: 'girder-1x6',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
});
const screw = (id: string, a: string, b: string, holeIndex = 0): PlacedPiece => ({
  ...piece(id),
  libraryId: 'fastener-3-8',
  fastener: {
    holes: [
      { pieceId: a, holeIndex },
      { pieceId: b, holeIndex },
    ],
    lengthInches: 0.375,
    stackDepthMm: 6.35,
  },
});

describe('stored screw connections', () => {
  it('follows screws through an assembly and ignores visual grouping', () => {
    const grouped = [{ ...piece('a'), groupId: 'g' }, { ...piece('b'), groupId: 'g' }, piece('c')];
    expect([...attachedPieceIds(grouped, 'a')]).toEqual(['a']);
    const placed = [...grouped, screw('ab', 'a', 'b'), screw('bc', 'b', 'c')];
    expect([...attachedPieceIds(placed, 'a')].sort()).toEqual(['a', 'b', 'c']);
    expect(fastenersAtPiece(placed, 'b')).toHaveLength(2);
  });

  it('allows one hinge anchor and fixes a joint with two screws', () => {
    const first = screw('first', 'a', 'b');
    const placed = [piece('a'), piece('b'), first];
    expect(hingeFastener(placed, 'a')).toBe(first);
    expect(hingeFastener([...placed, screw('second', 'a', 'b', 1)], 'a')).toBeNull();
  });

  it('marks occupied holes on every layer while leaving adjacent holes available', () => {
    const placed = [piece('a'), piece('b'), screw('s', 'a', 'b')];
    expect(holeHasFastener(placed, { pieceId: 'a', holeIndex: 0 })).toBe(true);
    expect(holeHasFastener(placed, { pieceId: 'b', holeIndex: 0 })).toBe(true);
    expect(holeHasFastener(placed, { pieceId: 'a', holeIndex: 1 })).toBe(false);
  });

  it('deletes a fastener without disturbing pieces and removes orphaned units with a deleted piece', () => {
    const a = piece('a'),
      b = piece('b'),
      s = screw('s', 'a', 'b');
    expect(removePlaced([a, b, s], ['s'])).toEqual([a, b]);
    expect(removePlaced([a, b, s], ['a'])).toEqual([b]);
  });

  it('rejects invalid layer references, repeated pieces, and the wrong automatic length', () => {
    const unit = screw('s', 'a', 'b').fastener!;
    expect(isFastenerConnection(unit)).toBe(true);
    expect(isFastenerConnection({ ...unit, lengthInches: 0.5 })).toBe(false);
    expect(
      isFastenerConnection({
        ...unit,
        holes: [
          { pieceId: 'a', holeIndex: 0 },
          { pieceId: 'a', holeIndex: 1 },
        ],
      }),
    ).toBe(false);
    expect(
      isFastenerConnection({
        ...unit,
        holes: [
          { pieceId: 'a', holeIndex: -1 },
          { pieceId: 'b', holeIndex: 0 },
        ],
      }),
    ).toBe(false);
    expect(isFastenerConnection({ ...unit, holes: [] })).toBe(false);
  });

  it('round-trips joint references, grouping, and locks, and rejects orphaned saved joints', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const doc = {
      id: 'design',
      name: 'Joint',
      updatedAt: 1,
      placed: [{ ...piece('a'), locked: true, groupId: 'g' }, piece('b'), screw('s', 'a', 'b')],
    };
    writeRecoveryDraft(storage, doc);
    expect(readRecoveryDraft(storage)).toEqual(doc);
    writeRecoveryDraft(storage, { ...doc, placed: [piece('a'), screw('s', 'a', 'missing')] });
    expect(readRecoveryDraft(storage)).toBeNull();
  });

  it('preserves and repairs old duplicate piece IDs without losing either placement', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const a = piece('placed-1'),
      b = { ...piece('placed-1'), position: { x: 20, y: 0, z: 0 } };
    writeRecoveryDraft(storage, { id: 'legacy', name: 'Old design', updatedAt: 1, placed: [a, b] });
    const restored = readRecoveryDraft(storage)!;
    expect(restored.placed).toHaveLength(2);
    expect(new Set(restored.placed.map((entry) => entry.id)).size).toBe(2);
    expect(restored.placed.map((entry) => entry.position)).toEqual([a.position, b.position]);
  });
});

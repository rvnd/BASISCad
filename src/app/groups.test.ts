import { describe, expect, it } from 'vitest';
import type { PlacedPiece } from './design';
import { createGroup, groupSelection, motionIds, selectPiece, toggleLock, ungroup } from './groups';
import { readRecoveryDraft, writeRecoveryDraft } from './projects';

const piece = (id: string): PlacedPiece => ({
  id,
  libraryId: 'stock',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
});
const screw: PlacedPiece = {
  ...piece('unit'),
  fastener: {
    holes: [
      { pieceId: 'a', holeIndex: 0 },
      { pieceId: 'b', holeIndex: 0 },
    ],
    lengthInches: 0.375,
    stackDepthMm: 6.35,
  },
};

describe('assembly editing membership', () => {
  it('groups selected stock and its complete fastener and selects or deselects all members together', () => {
    const placed = createGroup(
      [piece('a'), piece('b'), screw, piece('other')],
      ['a', 'b'],
      'group',
    );
    expect([...groupSelection(placed, ['a'])].sort()).toEqual(['a', 'b', 'unit']);
    expect([...selectPiece(placed, [], 'b', false)].sort()).toEqual(['a', 'b', 'unit']);
    expect(selectPiece(placed, ['a', 'b', 'unit'], 'b', true)).toEqual([]);
    expect(placed[3]!.groupId).toBeUndefined();
  });
  it('moves connected stock and hardware and includes editing groups without treating them as screws', () => {
    const placed = [
      piece('a'),
      piece('b'),
      screw,
      { ...piece('c'), groupId: 'g' },
      { ...piece('d'), groupId: 'g' },
    ];
    expect([...motionIds(placed, ['unit'])].sort()).toEqual(['a', 'b', 'unit']);
    expect([...motionIds(placed, ['c'])].sort()).toEqual(['c', 'd']);
  });
  it('locks selected groups together, permits locking only one ungrouped partner, and ungroups without moving anything', () => {
    const grouped = createGroup([piece('a'), piece('b'), screw], ['a', 'b'], 'group');
    const locked = toggleLock(grouped, ['a']);
    expect(locked.every((piece) => piece.locked)).toBe(true);
    const unlocked = toggleLock(locked, ['unit']);
    expect(unlocked.every((piece) => !piece.locked)).toBe(true);
    const separate = ungroup(unlocked, ['b']);
    expect(separate.every((piece) => !piece.groupId)).toBe(true);
    separate.forEach((piece, i) => expect(piece.position).toBe(grouped[i]!.position));
    expect(toggleLock(separate, ['a'])[1]!.locked).toBe(false);
  });
  it('saves group frames and hinge angles and rejects malformed pose metadata', () => {
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
      removeItem: () => {
        value = null;
      },
    };
    const placed = createGroup([piece('a'), piece('b'), screw], ['a', 'b'], 'group').map(
      (piece) => ({ ...piece, hingeAngleDeg: 25, groupRotation: { x: 10, y: 90, z: 0 } }),
    );
    const design = { id: 'design', name: 'Frames', placed, updatedAt: 1 };
    writeRecoveryDraft(storage, design);
    expect(readRecoveryDraft(storage)).toEqual(design);
    value = JSON.stringify({ ...design, placed: [{ ...placed[0], hingeAngleDeg: 'bad' }] });
    expect(readRecoveryDraft(storage)).toBeNull();
  });
});

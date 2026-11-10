import { describe, expect, it } from 'vitest';
import type { PlacedPiece } from './design';
import { resetLabels, updateLabel } from './labels';
import { readRecoveryDraft, writeRecoveryDraft, recoveryMatchesSavedDesign } from './projects';
const placed: readonly PlacedPiece[] = [
  { id: 'a', libraryId: 'stock', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
];
describe('saved blueprint preferences', () => {
  it('moves and hides labels without changing piece poses, and resets them', () => {
    const moved = updateLabel(placed, 'a', { offset: { x: 100, y: -40 } });
    const hidden = updateLabel(moved, 'a', { hidden: true });
    expect(hidden[0]!.position).toBe(placed[0]!.position);
    expect(hidden[0]!.rotation).toBe(placed[0]!.rotation);
    expect(hidden[0]!.label).toEqual({ offset: { x: 100, y: -40 }, hidden: true });
    expect(resetLabels(hidden)[0]!.label).toBeUndefined();
    expect(updateLabel(placed, 'a', { hidden: true })[0]!.label?.offset).toBeUndefined();
  });
  it('round trips modes, offsets and individual visibility, while rejecting corrupt metadata', () => {
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
    const design = {
      id: 'design',
      name: 'Labels',
      updatedAt: 1,
      labelMode: 'names' as const,
      placed: updateLabel(placed, 'a', { offset: { x: 25, y: 30 }, hidden: true }),
    };
    writeRecoveryDraft(storage, design);
    expect(readRecoveryDraft(storage)).toEqual(design);
    expect(recoveryMatchesSavedDesign({ ...design, labelMode: 'measurements' }, [design])).toBe(
      false,
    );
    value = JSON.stringify({ ...design, labelMode: 'bogus' });
    expect(readRecoveryDraft(storage)).toBeNull();
    value = JSON.stringify({
      ...design,
      placed: [{ ...placed[0], label: { hidden: false, offset: { x: 'bad', y: 0 } } }],
    });
    expect(readRecoveryDraft(storage)).toBeNull();
  });
});

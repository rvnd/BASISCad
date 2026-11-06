import { describe, expect, it } from 'vitest';
import {
  RECOVERY_STORAGE_KEY,
  SAVED_DESIGNS_STORAGE_KEY,
  clearRecoveryDraft,
  deleteSavedDesign,
  readRecoveryDraft,
  readSavedDesigns,
  recoveryMatchesSavedDesign,
  saveDesign,
  writeRecoveryDraft,
} from './projects';
import type { DesignDocument, StorageLike } from './projects';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const design: DesignDocument = {
  id: 'design-1',
  name: 'Bridge',
  placed: [
    {
      id: 'piece-1',
      libraryId: 'girder-1x4',
      position: { x: 0, y: 5, z: -10 },
      rotation: { x: 0, y: 45, z: 0 },
    },
  ],
  updatedAt: 100,
};

describe('local design storage', () => {
  it('saves, updates, sorts, and reopens named designs', () => {
    const storage = new MemoryStorage();
    const first = saveDesign(storage, design);
    const updated = { ...design, name: 'Bridge v2', updatedAt: 200 };
    const second = saveDesign(storage, updated);
    expect(first).toHaveLength(1);
    expect(second).toEqual([updated]);
    expect(readSavedDesigns(storage)).toEqual([updated]);
  });

  it('deletes a saved copy without modifying a separate recovery draft', () => {
    const storage = new MemoryStorage();
    saveDesign(storage, design);
    writeRecoveryDraft(storage, design);
    expect(deleteSavedDesign(storage, design.id)).toEqual([]);
    expect(readRecoveryDraft(storage)).toEqual(design);
  });

  it('restores and clears the recovery draft', () => {
    const storage = new MemoryStorage();
    writeRecoveryDraft(storage, design);
    expect(readRecoveryDraft(storage)).toEqual(design);
    clearRecoveryDraft(storage);
    expect(readRecoveryDraft(storage)).toBeNull();
    expect(storage.getItem(RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it('recognizes when a recovery draft already matches its saved copy', () => {
    expect(recoveryMatchesSavedDesign(design, [design])).toBe(true);
    expect(recoveryMatchesSavedDesign({ ...design, name: 'Changed' }, [design])).toBe(false);
    expect(recoveryMatchesSavedDesign({ ...design, placed: [] }, [design])).toBe(false);
  });

  it('ignores malformed storage instead of crashing startup', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVED_DESIGNS_STORAGE_KEY, '{');
    storage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({ name: 'broken' }));
    expect(readSavedDesigns(storage)).toEqual([]);
    expect(readRecoveryDraft(storage)).toBeNull();
  });
});

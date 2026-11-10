import { describe, expect, it } from 'vitest';
import { GUIDE_SEEN_STORAGE_KEY, markGuideSeen, readGuideSeen } from './guide';

describe('first-use guide preference', () => {
  it('remembers dismissal and treats missing or corrupt preferences as first use', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    expect(readGuideSeen(storage)).toBe(false);
    values.set(GUIDE_SEEN_STORAGE_KEY, 'unknown');
    expect(readGuideSeen(storage)).toBe(false);
    markGuideSeen(storage);
    expect(readGuideSeen(storage)).toBe(true);
  });

  it('keeps the guide usable when storage is blocked', () => {
    const storage = {
      getItem: () => {
        throw new Error('Storage blocked');
      },
      setItem: () => {
        throw new Error('Storage blocked');
      },
    };
    expect(readGuideSeen(storage)).toBe(false);
    expect(() => markGuideSeen(storage)).not.toThrow();
  });
});

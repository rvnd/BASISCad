import { describe, expect, it } from 'vitest';
import { getScrewLengthInches } from './screws';

describe('getScrewLengthInches', () => {
  it('2 layers take a 3/8 inch screw', () => {
    expect(getScrewLengthInches(2)).toBe(3 / 8);
  });

  it('3 layers take a 1/2 inch screw', () => {
    expect(getScrewLengthInches(3)).toBe(1 / 2);
  });

  it('4 layers take a 1/2 inch screw', () => {
    expect(getScrewLengthInches(4)).toBe(1 / 2);
  });

  it('1 layer needs no screw', () => {
    expect(() => getScrewLengthInches(1)).toThrow(RangeError);
  });

  it('5 or more layers are not supported', () => {
    expect(() => getScrewLengthInches(5)).toThrow(RangeError);
  });

  it('a fractional layer count is rejected', () => {
    expect(() => getScrewLengthInches(2.5)).toThrow(RangeError);
  });
});

import { describe, expect, it } from 'vitest';
import { axisDragDelta, isTabletInput } from './tabletControls';

describe('tablet input and axis gestures', () => {
  it('requires multiple touches, a coarse pointer and a tablet-sized screen', () => {
    const tablet = { touchPoints: 5, coarsePointer: true, width: 1024, height: 768 };
    expect(isTabletInput(tablet)).toBe(true);
    expect(isTabletInput({ ...tablet, touchPoints: 0 })).toBe(false);
    expect(isTabletInput({ ...tablet, coarsePointer: false })).toBe(false);
    expect(isTabletInput({ ...tablet, width: 390 })).toBe(false);
    expect(isTabletInput({ ...tablet, width: 768, height: 1024 })).toBe(true);
  });

  it('uses only the screen component parallel to the chosen world axis', () => {
    expect(axisDragDelta({ x: 40, y: 300 }, { x: 2, y: 0 })).toBe(20);
    expect(axisDragDelta({ x: 300, y: -40 }, { x: 0, y: -2 })).toBe(20);
    expect(axisDragDelta({ x: 30, y: 10 }, { x: 1, y: 1 })).toBe(20);
    expect(axisDragDelta({ x: 20, y: -20 }, { x: 1, y: 1 })).toBe(0);
    expect(axisDragDelta({ x: 40, y: 10 }, { x: 0, y: 0 })).toBe(0);
  });
});

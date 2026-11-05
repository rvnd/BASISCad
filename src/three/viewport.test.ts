import { describe, expect, it } from 'vitest';
import { dragAxisForGesture } from './viewport';

/**
 * The drag-axis mapping behind the live angle badge: the viewport
 * reports the dragged axis to the App on handle-drag start, and null
 * when the drag ends. Only a handle gesture drags about an axis —
 * its own axis — so the badge can never name the wrong one, and it
 * hides on release.
 */
describe('dragAxisForGesture', () => {
  it('returns the handle’s own axis on a handle drag', () => {
    expect(dragAxisForGesture('handle', 'x')).toBe('x');
    expect(dragAxisForGesture('handle', 'y')).toBe('y');
    expect(dragAxisForGesture('handle', 'z')).toBe('z');
  });

  it('returns null for every other gesture and for the end of a drag', () => {
    expect(dragAxisForGesture('rotate', null)).toBeNull();
    expect(dragAxisForGesture('move', null)).toBeNull();
    expect(dragAxisForGesture(null, null)).toBeNull();
    expect(dragAxisForGesture('handle', null)).toBeNull();
  });
});

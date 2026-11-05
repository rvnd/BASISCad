import { describe, expect, it } from 'vitest';
import {
  addRotation,
  flipRotation,
  isRotationStep,
  normalizeAngleDeg,
  parseAngleInput,
  resetRotation,
  setRotation,
  snapDeltaDeg,
} from './rotation';

describe('normalizeAngleDeg', () => {
  it('keeps angles already in range', () => {
    expect(normalizeAngleDeg(0)).toBe(0);
    expect(normalizeAngleDeg(45)).toBe(45);
    expect(normalizeAngleDeg(-30)).toBe(-30);
    expect(normalizeAngleDeg(180)).toBe(180);
    expect(normalizeAngleDeg(-179.5)).toBe(-179.5);
  });

  it('wraps angles outside the range', () => {
    expect(normalizeAngleDeg(270)).toBe(-90);
    expect(normalizeAngleDeg(-270)).toBe(90);
    expect(normalizeAngleDeg(360)).toBe(0);
    expect(normalizeAngleDeg(-180)).toBe(180);
    expect(normalizeAngleDeg(450)).toBe(90);
    expect(normalizeAngleDeg(225)).toBe(-135);
  });
});

describe('rotation updates', () => {
  const base = { x: 0, y: 0, z: 45 };

  it('adds a step to one axis only', () => {
    expect(addRotation(base, 'z', 45)).toEqual({ x: 0, y: 0, z: 90 });
    expect(addRotation(base, 'x', 15)).toEqual({ x: 15, y: 0, z: 45 });
  });

  it('adds exactly 90° to one axis only, wrapping past 180° — the panel 90° button', () => {
    // From 45° it lands on 135°, from 135° it wraps to -135°.
    expect(addRotation({ x: 45, y: 0, z: 0 }, 'x', 90)).toEqual({ x: 135, y: 0, z: 0 });
    expect(addRotation({ x: 135, y: 0, z: 0 }, 'x', 90)).toEqual({ x: -135, y: 0, z: 0 });
    expect(addRotation({ x: 0, y: 0, z: 0 }, 'y', 90)).toEqual({ x: 0, y: 90, z: 0 });
  });

  it('applies a typed angle from the badge exactly as the panel fields do', () => {
    // The badge's commit path is parseAngleInput + setRotation — the
    // same two functions the panel's typed fields use. Decimals and
    // negatives are accepted, and -30 lands exactly on -30.
    expect(setRotation(base, 'z', parseAngleInput('-30') ?? 0)).toEqual({ x: 0, y: 0, z: -30 });
    expect(setRotation(base, 'x', parseAngleInput('45.5') ?? 0)).toEqual({
      x: 45.5,
      y: 0,
      z: 45,
    });
    expect(setRotation(base, 'y', parseAngleInput('270') ?? 0)).toEqual({ x: 0, y: -90, z: 45 });
    expect(parseAngleInput('abc')).toBeNull();
  });

  it('sets an axis to an absolute angle', () => {
    // Typing -30 sets exactly -30, not 330.
    expect(setRotation(base, 'z', -30)).toEqual({ x: 0, y: 0, z: -30 });
    expect(setRotation(base, 'y', 270)).toEqual({ x: 0, y: -90, z: 45 });
  });

  it('flips an axis 180 degrees, like the prototype', () => {
    // The prototype's flip took 45° to -135°.
    expect(flipRotation(base, 'z')).toEqual({ x: 0, y: 0, z: -135 });
    expect(flipRotation({ x: 0, y: 0, z: 0 }, 'x')).toEqual({ x: 180, y: 0, z: 0 });
  });

  it('resets to no rotation', () => {
    expect(resetRotation()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('offers 15, 45, and 90 degree steps', () => {
    expect(isRotationStep(15)).toBe(true);
    expect(isRotationStep(45)).toBe(true);
    expect(isRotationStep(90)).toBe(true);
    expect(isRotationStep(30)).toBe(false);
  });
});

describe('parseAngleInput', () => {
  it('accepts decimals and negatives', () => {
    expect(parseAngleInput('-30')).toBe(-30);
    expect(parseAngleInput('45.5')).toBe(45.5);
    expect(parseAngleInput('  90  ')).toBe(90);
    expect(parseAngleInput('+15')).toBe(15);
    expect(parseAngleInput('.5')).toBe(0.5);
  });

  it('rejects anything that is not a plain number', () => {
    expect(parseAngleInput('')).toBeNull();
    expect(parseAngleInput('abc')).toBeNull();
    expect(parseAngleInput('30°')).toBeNull();
    expect(parseAngleInput('1e3')).toBeNull();
    expect(parseAngleInput('30 45')).toBeNull();
    expect(parseAngleInput('--30')).toBeNull();
  });
});

describe('snapDeltaDeg', () => {
  it('snaps a drag to the nearest step multiple from where it started', () => {
    expect(snapDeltaDeg(17, 15)).toBe(15);
    expect(snapDeltaDeg(23, 15)).toBe(30);
    expect(snapDeltaDeg(-30, 45)).toBe(-45);
    expect(snapDeltaDeg(100, 45)).toBe(90);
    expect(snapDeltaDeg(7, 90)).toBe(0);
    expect(snapDeltaDeg(50, 90)).toBe(90);
  });

  it('leaves the delta alone when there is no step', () => {
    expect(snapDeltaDeg(17.3, 0)).toBe(17.3);
  });
});

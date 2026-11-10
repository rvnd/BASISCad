import type { RotationDeg } from './design';

/**
 * Pure rotation math for Milestone 4 — no Three.js here, so every
 * rule is unit-testable.
 *
 * Angles are stored in degrees and normalised to (-180, 180]: 45 stays
 * 45, -30 stays -30, 270 becomes -90, and a 180° flip from 45° lands
 * on -135°, exactly as the prototype did. Normalising on every update
 * keeps the panel readable — the stored value is always the angle the
 * panel shows.
 */

/** Fixed increment for all manual rotation controls. */
export const MANUAL_ROTATION_STEP_DEG = 22.5;
export const ROTATION_STEPS: readonly number[] = [MANUAL_ROTATION_STEP_DEG];

/** True for a step size the panel offers. */
export function isRotationStep(value: number): boolean {
  return ROTATION_STEPS.includes(value);
}

/**
 * Normalise an angle in degrees to (-180, 180]: -180 becomes 180,
 * 270 becomes -90, -30 stays -30.
 */
export function normalizeAngleDeg(angle: number): number {
  const wrapped = ((angle % 360) + 360) % 360;
  if (wrapped > 180) {
    return wrapped - 360;
  }
  return wrapped === 180 ? 180 : wrapped;
}

/** The rotation with one axis moved by `delta` degrees, normalised. */
export function addRotation(
  rotation: RotationDeg,
  axis: keyof RotationDeg,
  delta: number,
): RotationDeg {
  return { ...rotation, [axis]: normalizeAngleDeg(rotation[axis] + delta) };
}

/** The rotation with one axis set to an absolute angle, normalised. */
export function setRotation(
  rotation: RotationDeg,
  axis: keyof RotationDeg,
  degrees: number,
): RotationDeg {
  return { ...rotation, [axis]: normalizeAngleDeg(degrees) };
}

/** The rotation with one axis flipped 180°. */
export function flipRotation(rotation: RotationDeg, axis: keyof RotationDeg): RotationDeg {
  return addRotation(rotation, axis, 180);
}

/** Snap a change relative to the starting pose; nonpositive steps leave it unchanged. */
export function snapDeltaDeg(delta: number, step: number): number {
  if (!(step > 0)) {
    return delta;
  }
  return Math.sign(delta) * Math.round(Math.abs(delta) / step) * step;
}

/** Snap typed absolute angles to the fixed manual increment, then wrap for display. */
export function snapManualAngle(degrees: number): number {
  return normalizeAngleDeg(snapDeltaDeg(normalizeAngleDeg(degrees), MANUAL_ROTATION_STEP_DEG));
}

/** No rotation on any axis. */
export function resetRotation(): RotationDeg {
  return { x: 0, y: 0, z: 0 };
}

const ANGLE_INPUT_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Parse a typed angle: decimals and negatives are allowed, so "-30"
 * and "45.5" both parse; anything else (empty, letters, "30°",
 * "1e3") returns null and the panel keeps the old value.
 */
export function parseAngleInput(text: string): number | null {
  const trimmed = text.trim();
  if (!ANGLE_INPUT_PATTERN.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parse a typed position in millimetres: same rules as an angle —
 * decimals and negatives allowed, anything else returns null.
 */
export function parsePositionInput(text: string): number | null {
  return parseAngleInput(text);
}

/**
 * Screw lengths are automatic — the student is only ever asked
 * "Add screw and nut?", never which length. The length depends only on
 * how many layers of pieces the screw passes through.
 */

/** Screw length (inches) for a stack of 2 layers. */
export const SCREW_LENGTH_TWO_LAYERS_IN = 3 / 8;
/** Screw length (inches) for a stack of 3 or 4 layers. */
export const SCREW_LENGTH_THREE_OR_FOUR_LAYERS_IN = 1 / 2;

/**
 * Return the screw length, in inches, for a stack of `layers` pieces.
 *
 * @throws RangeError for anything other than 2, 3, or 4 layers — a
 * single layer needs no screw, and stacks of 5+ are not supported.
 */
export function getScrewLengthInches(layers: number): number {
  if (!Number.isInteger(layers)) {
    throw new RangeError(`Layer count must be a whole number, got ${layers}`);
  }
  if (layers === 2) {
    return SCREW_LENGTH_TWO_LAYERS_IN;
  }
  if (layers === 3 || layers === 4) {
    return SCREW_LENGTH_THREE_OR_FOUR_LAYERS_IN;
  }
  throw new RangeError(`Screw length is only defined for 2–4 layers, got ${layers}`);
}

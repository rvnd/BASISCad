/**
 * Frozen spec — values from the ChatGPT prototype that do not change.
 *
 * These are the single source of truth for the numbers in
 * `basiscad-milestone-plan.md` ("The spec that does not change"). Nothing
 * else in the app should hard-code a copy of these values; import them.
 * If a value ever needs to change, change it here and fix every test
 * and caller that assumed the old value — that is the point.
 */

/** Workplane is a 1,000 × 1,000 mm square. Nothing goes below it. */
export const WORKPLANE_SIZE_MM = 1000;
/** Half the workplane, for centring geometry on the origin. */
export const WORKPLANE_HALF_MM = WORKPLANE_SIZE_MM / 2;
/** Grid cell size on the workplane, in mm. */
export const GRID_CELL_MM = 10;

/** Holes within this distance (mm) of aligning count as aligned. */
export const HOLE_TOLERANCE_MM = 2;

/** Budget: one US dollar per hole in a piece. */
export const COST_PER_HOLE_USD = 1;

/** Screws are always #6-32 zinc-plated steel, screw + nut as a pair. */
export const SCREW_SPEC = '#6-32 zinc-plated steel';

/** Material assumption for the test milestones (15–18). */
export const MATERIAL = 'Bambu PLA Basic';
export const MATERIAL_INFILL_PERCENT = 15;

/** Brand colours: black, white, and red. */
export const BRAND_RED = '#D03F43';
export const BRAND_BLACK = '#000000';
export const BRAND_WHITE = '#ffffff';

/**
 * Brand font. Roboto is the spec font; there is deliberately no Google
 * Fonts (or any other) network dependency, so the app builds and runs
 * fully offline. Roboto is used when installed on the device, and the
 * stack falls back to Arial/Helvetica/sans-serif otherwise.
 */
export const FONT_FAMILY = 'Roboto, Arial, Helvetica, sans-serif';

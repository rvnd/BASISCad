import { describe, expect, it } from 'vitest';
import {
  BRAND_RED,
  COST_PER_HOLE_USD,
  GRID_CELL_MM,
  HOLE_TOLERANCE_MM,
  MATERIAL_INFILL_PERCENT,
  WORKPLANE_HALF_MM,
  WORKPLANE_SIZE_MM,
} from './constants';

describe('frozen spec constants', () => {
  it('workplane is 1,000 × 1,000 mm', () => {
    expect(WORKPLANE_SIZE_MM).toBe(1000);
    expect(WORKPLANE_HALF_MM).toBe(500);
  });

  it('grid divides the workplane into whole cells', () => {
    expect(WORKPLANE_SIZE_MM % GRID_CELL_MM).toBe(0);
  });

  it('holes within 2 mm count as aligned', () => {
    expect(HOLE_TOLERANCE_MM).toBe(2);
  });

  it('budget is $1 per hole', () => {
    expect(COST_PER_HOLE_USD).toBe(1);
  });

  it('material assumption is 15% infill', () => {
    expect(MATERIAL_INFILL_PERCENT).toBe(15);
  });

  it('brand red is #D03F43', () => {
    expect(BRAND_RED).toBe('#D03F43');
  });
});

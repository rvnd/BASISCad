import { describe, expect, it } from 'vitest';
import type { PlacedPiece } from './design';
import { SPEC_PIECES } from './library';
import { printBudget } from './printBudget';
const library = new Map(SPEC_PIECES.map((piece) => [piece.id, piece]));
const piece = (id: string, libraryId: string): PlacedPiece => ({
  id,
  libraryId,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
});
describe('classroom print budget', () => {
  it('totals two 1x4 girders and one 1x6 girder as three pieces and fourteen dollars', () => {
    const budget = printBudget(
      [piece('a', 'girder-1x4'), piece('b', 'girder-1x4'), piece('c', 'girder-1x6')],
      library,
    );
    expect(budget).toMatchObject({ pieces: 3, cost: 14, fasteners: 0, unknownCosts: 0 });
    expect(
      budget.rows.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        holes: row.holes,
        cost: row.cost,
      })),
    ).toEqual([
      { name: '1x4 Girder', quantity: 2, holes: 4, cost: 8 },
      { name: '1x6 Girder', quantity: 1, holes: 6, cost: 6 },
    ]);
  });
  it('lists hardware separately and does not invent prices for unknown imported holes', () => {
    const stock = piece('a', 'girder-1x4'),
      imported = piece('b', 'unpriced');
    const screw = {
      ...piece('unit', 'fastener'),
      fastener: {
        holes: [
          { pieceId: 'a', holeIndex: 0 },
          { pieceId: 'b', holeIndex: 0 },
        ],
        lengthInches: 0.375 as const,
        stackDepthMm: 6.35,
      },
    };
    const budget = printBudget([stock, imported, screw], library);
    expect(budget).toMatchObject({ pieces: 2, fasteners: 1, cost: 4, unknownCosts: 1 });
    expect(budget.rows.find((row) => row.hardware)?.name).toContain('screw + nut');
    expect(budget.rows.find((row) => row.id === 'unpriced')?.cost).toBeNull();
  });
});

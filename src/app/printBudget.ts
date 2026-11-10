import type { PlacedPiece } from './design';
import type { LibraryPiece } from './library';
import { COST_PER_HOLE_USD } from './constants';
import { fastenerName } from './connections';

export interface BudgetRow {
  id: string;
  name: string;
  quantity: number;
  holes: number | null;
  cost: number | null;
  hardware: boolean;
}
export interface PrintBudget {
  rows: readonly BudgetRow[];
  pieces: number;
  fasteners: number;
  cost: number;
  unknownCosts: number;
}
export function printBudget(
  placed: readonly PlacedPiece[],
  library: ReadonlyMap<string, LibraryPiece>,
): PrintBudget {
  const rows = new Map<string, BudgetRow>();
  for (const piece of placed) {
    const meta = library.get(piece.libraryId),
      hardware = !!piece.fastener;
    const key = hardware ? `fastener-${piece.fastener!.lengthInches}` : piece.libraryId;
    const row = rows.get(key);
    const holes = hardware ? null : (meta?.holeCount ?? null);
    if (row) {
      row.quantity++;
      if (row.cost !== null) row.cost += holes! * COST_PER_HOLE_USD;
    } else
      rows.set(key, {
        id: key,
        name: hardware ? fastenerName(piece.fastener!) : (meta?.name ?? 'Unknown piece'),
        quantity: 1,
        holes,
        cost: holes === null ? null : holes * COST_PER_HOLE_USD,
        hardware,
      });
  }
  const all = [...rows.values()].sort(
    (a, b) => Number(a.hardware) - Number(b.hardware) || a.name.localeCompare(b.name),
  );
  return {
    rows: all,
    pieces: all.filter((r) => !r.hardware).reduce((n, r) => n + r.quantity, 0),
    fasteners: all.filter((r) => r.hardware).reduce((n, r) => n + r.quantity, 0),
    cost: all.reduce((n, r) => n + (r.cost ?? 0), 0),
    unknownCosts: all.filter((r) => !r.hardware && r.cost === null).length,
  };
}

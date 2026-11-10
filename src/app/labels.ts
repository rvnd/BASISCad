import type { PlacedPiece } from './design';

export type LabelMode = 'off' | 'names' | 'measurements';
export interface LabelPlacement {
  offset?: { x: number; y: number };
  hidden: boolean;
}
export function isLabelMode(value: unknown): value is LabelMode {
  return value === 'off' || value === 'names' || value === 'measurements';
}
export function isLabelPlacement(value: unknown): value is LabelPlacement {
  if (!value || typeof value !== 'object') return false;
  const label = value as Partial<LabelPlacement>;
  return (
    typeof label.hidden === 'boolean' &&
    (label.offset === undefined ||
      (label.offset !== null &&
        typeof label.offset === 'object' &&
        Number.isFinite(label.offset.x) &&
        Number.isFinite(label.offset.y)))
  );
}
export function updateLabel(
  placed: readonly PlacedPiece[],
  id: string,
  change: Partial<LabelPlacement>,
): readonly PlacedPiece[] {
  return placed.map((piece) =>
    piece.id === id
      ? {
          ...piece,
          label: { ...(piece.label ?? { hidden: false }), ...change },
        }
      : piece,
  );
}
export function resetLabels(placed: readonly PlacedPiece[]): readonly PlacedPiece[] {
  return placed.map((piece) => (piece.label ? { ...piece, label: undefined } : piece));
}

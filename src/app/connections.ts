import type { PlacedPiece } from './design';

export interface HoleRef {
  pieceId: string;
  holeIndex: number;
}

/** A screw and its nut are one design item; references survive saving and undo. */
export interface FastenerConnection {
  holes: readonly HoleRef[];
  lengthInches: 0.375 | 0.5;
  stackDepthMm: number;
}

export function fastenerName(unit: FastenerConnection): string {
  return `#6-32 screw + nut · ${unit.lengthInches === 0.375 ? '3/8' : '1/2'} in`;
}

export function sameHole(a: HoleRef, b: HoleRef): boolean {
  return a.pieceId === b.pieceId && a.holeIndex === b.holeIndex;
}

export function fastenersAtPiece(
  placed: readonly PlacedPiece[],
  id: string,
): readonly PlacedPiece[] {
  return placed.filter((piece) => piece.fastener?.holes.some((hole) => hole.pieceId === id));
}

/** Grouping alone makes no attachment. Only stored screw connections join the graph. */
export function attachedPieceIds(placed: readonly PlacedPiece[], id: string): ReadonlySet<string> {
  const joined = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const piece of placed) {
      const holes = piece.fastener?.holes;
      if (!holes?.some((hole) => joined.has(hole.pieceId))) continue;
      for (const hole of holes) {
        if (!joined.has(hole.pieceId)) {
          joined.add(hole.pieceId);
          changed = true;
        }
      }
    }
  }
  return joined;
}

export function holeHasFastener(placed: readonly PlacedPiece[], hole: HoleRef): boolean {
  return placed.some((piece) => piece.fastener?.holes.some((entry) => sameHole(entry, hole)));
}

/** One joint can swing about its axis; distinct screws provide more than one anchor. */
export function hingeFastener(placed: readonly PlacedPiece[], pieceId: string): PlacedPiece | null {
  const fasteners = fastenersAtPiece(placed, pieceId);
  return fasteners.length === 1 ? fasteners[0]! : null;
}

export function isFastenerConnection(value: unknown): value is FastenerConnection {
  if (typeof value !== 'object' || value === null) return false;
  const unit = value as Partial<FastenerConnection>;
  if (unit.lengthInches !== 0.375 && unit.lengthInches !== 0.5) return false;
  if (
    typeof unit.stackDepthMm !== 'number' ||
    !Number.isFinite(unit.stackDepthMm) ||
    unit.stackDepthMm <= 0
  )
    return false;
  if (!Array.isArray(unit.holes) || unit.holes.length < 2 || unit.holes.length > 4) return false;
  const ids = new Set<string>();
  for (const value of unit.holes as unknown[]) {
    if (typeof value !== 'object' || value === null) return false;
    const hole = value as Partial<HoleRef>;
    if (
      typeof hole.pieceId !== 'string' ||
      !hole.pieceId ||
      typeof hole.holeIndex !== 'number' ||
      !Number.isInteger(hole.holeIndex) ||
      hole.holeIndex < 0 ||
      ids.has(hole.pieceId)
    )
      return false;
    ids.add(hole.pieceId);
  }
  return unit.lengthInches === (unit.holes.length === 2 ? 0.375 : 0.5);
}

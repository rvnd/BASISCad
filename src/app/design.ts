import { WORKPLANE_HALF_MM } from './constants';
import type { PieceSizeMm } from './library';

/**
 * Design state — the pieces placed on the workplane.
 *
 * Placed pieces live in App state as plain data (never Three.js
 * objects): which library piece, where its centre sits, and its
 * rotation. The viewport renders them from this data and reports
 * pointer actions back as data. Rotation is stored from the start
 * (all zeros for now; Milestone 4 adds rotate controls), and
 * selecting a piece never resets it — selecting always returns the
 * piece to Move mode with its rotation kept.
 *
 * Positions are the piece centre in millimetres on the workplane
 * (y is always 0 — nothing goes below the workplane).
 */

export interface RotationDeg {
  x: number;
  y: number;
  z: number;
}

export const NO_ROTATION: RotationDeg = { x: 0, y: 0, z: 0 };

export interface PlacedPiece {
  id: string;
  libraryId: string;
  position: { x: number; z: number };
  rotation: RotationDeg;
}

/**
 * Selection mode for the current selection. Only 'move' exists so
 * far — Milestone 4 adds 'rotate'. Selecting a piece always sets
 * 'move' and keeps the piece's rotation.
 */
export type SelectionMode = 'move';

/** Where a newly placed piece lands: near the centre, offset by index so pieces do not stack exactly. */
export function defaultPlacement(index: number, sizeMm: PieceSizeMm): { x: number; z: number } {
  const column = index % 4;
  const row = Math.floor(index / 4) % 4;
  const x = (column - 1.5) * 60;
  const z = (row - 1.5) * 60;
  return clampPosition(x, z, sizeMm);
}

/**
 * Keep a piece's footprint inside the 1,000 x 1,000 mm workplane.
 * A piece bigger than the workplane in some axis is centred on that axis.
 */
export function clampPosition(x: number, z: number, sizeMm: PieceSizeMm): { x: number; z: number } {
  const limitX = Math.max(0, WORKPLANE_HALF_MM - sizeMm.x / 2);
  const limitZ = Math.max(0, WORKPLANE_HALF_MM - sizeMm.z / 2);
  return {
    x: Math.min(Math.max(x, -limitX), limitX),
    z: Math.min(Math.max(z, -limitZ), limitZ),
  };
}

/** A new placed piece: at its default spot, unrotated. */
export function createPlacedPiece(
  id: string,
  libraryId: string,
  index: number,
  sizeMm: PieceSizeMm,
): PlacedPiece {
  return {
    id,
    libraryId,
    position: defaultPlacement(index, sizeMm),
    rotation: { ...NO_ROTATION },
  };
}

/**
 * Selection after a click. Without Shift the clicked piece becomes
 * the whole selection; with Shift it toggles in or out of the
 * existing selection (ready for grouping in Milestone 10).
 */
export function toggleSelection(
  selectedIds: readonly string[],
  id: string,
  additive: boolean,
): readonly string[] {
  if (!additive) {
    return [id];
  }
  if (selectedIds.includes(id)) {
    return selectedIds.filter((selectedId) => selectedId !== id);
  }
  return [...selectedIds, id];
}

/** The design with every selected piece removed. */
export function removePlaced(
  placed: readonly PlacedPiece[],
  selectedIds: readonly string[],
): readonly PlacedPiece[] {
  if (selectedIds.length === 0) {
    return placed;
  }
  const selected = new Set(selectedIds);
  return placed.filter((piece) => !selected.has(piece.id));
}

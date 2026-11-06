import { WORKPLANE_HALF_MM } from './constants';
import type { PieceSizeMm } from './library';
import { addRotation, flipRotation, resetRotation, setRotation } from './rotation';

/**
 * Design state — the pieces placed on the workplane.
 *
 * Placed pieces live in App state as plain data (never Three.js
 * objects): which library piece, where its centre sits, and its
 * rotation. The viewport renders them from this data and reports
 * pointer actions back as data. Rotation is stored from the start,
 * and selecting a piece never resets it — selecting always returns
 * the piece to Move mode with its rotation kept.
 *
 * Positions are the piece centre in millimetres on the workplane.
 * X runs across the workplane, Z runs into it, and Y is the height
 * of the piece's base above the workplane (0 = sitting on it).
 * Nothing goes below the workplane: Y is never negative, and the
 * viewport lifts a rotated piece just enough that its lowest point
 * stays on y = 0.
 */

export interface RotationDeg {
  x: number;
  y: number;
  z: number;
}

export const NO_ROTATION: RotationDeg = { x: 0, y: 0, z: 0 };

/** A piece's centre on the workplane: x and z across it, y above it. */
export interface PositionMm {
  x: number;
  y: number;
  z: number;
}

export interface PlacedPiece {
  id: string;
  libraryId: string;
  position: PositionMm;
  rotation: RotationDeg;
}

/**
 * Selection mode for the current selection. 'move' drags a piece
 * across the workplane; 'rotate' drags it around the vertical axis
 * instead, and shows the rotation handles. The mode is the user's
 * choice: selecting a piece keeps the current mode (and the piece's
 * rotation); only the panel toggle and grabbing a handle change it.
 */
export type SelectionMode = 'move' | 'rotate';

/** Where a newly placed piece lands: near the centre, offset by index so pieces do not stack exactly. */
export function defaultPlacement(index: number, sizeMm: PieceSizeMm): PositionMm {
  const column = index % 4;
  const row = Math.floor(index / 4) % 4;
  const x = (column - 1.5) * 60;
  const z = (row - 1.5) * 60;
  return clampPosition(x, 0, z, sizeMm);
}

/**
 * Keep a piece's footprint inside the 1,000 x 1,000 mm workplane and
 * its base on or above it. A piece bigger than the workplane in some
 * axis is centred on that axis. The footprint is measured from the
 * piece's unrotated size — a rotated piece's footprint can extend a
 * little past the edge, which Milestone 7 (collision) polices
 * properly.
 */
export function clampPosition(x: number, y: number, z: number, sizeMm: PieceSizeMm): PositionMm {
  const limitX = Math.max(0, WORKPLANE_HALF_MM - sizeMm.x / 2);
  const limitZ = Math.max(0, WORKPLANE_HALF_MM - sizeMm.z / 2);
  return {
    x: Math.min(Math.max(x, -limitX), limitX),
    y: Math.max(0, y),
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

/**
 * Move the selected pieces to an absolute position (one axis at a
 * time from the panel, or all three at once). The position is clamped
 * to the workplane and to y >= 0; pieces not in the selection are
 * untouched. `sizeById` supplies each piece's size for clamping, or
 * the position is left unclamped when a size is unknown.
 */
export function setPiecesPosition(
  placed: readonly PlacedPiece[],
  selectedIds: readonly string[],
  position: PositionMm,
  sizeById: ReadonlyMap<string, PieceSizeMm>,
): readonly PlacedPiece[] {
  if (selectedIds.length === 0) {
    return placed;
  }
  const selected = new Set(selectedIds);
  return placed.map((piece) => {
    if (!selected.has(piece.id)) {
      return piece;
    }
    const sizeMm = sizeById.get(piece.libraryId);
    return {
      ...piece,
      position:
        sizeMm === undefined
          ? { ...position, y: Math.max(0, position.y) }
          : clampPosition(position.x, position.y, position.z, sizeMm),
    };
  });
}

/** Move a whole design to the centre of the workplane without changing its shape or heights. */
export function centerDesign(
  placed: readonly PlacedPiece[],
  sizeById: ReadonlyMap<string, PieceSizeMm>,
): readonly PlacedPiece[] {
  if (placed.length === 0) {
    return placed;
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const piece of placed) {
    const size = sizeById.get(piece.libraryId);
    const halfX = (size?.x ?? 0) / 2;
    const halfZ = (size?.z ?? 0) / 2;
    minX = Math.min(minX, piece.position.x - halfX);
    maxX = Math.max(maxX, piece.position.x + halfX);
    minZ = Math.min(minZ, piece.position.z - halfZ);
    maxZ = Math.max(maxZ, piece.position.z + halfZ);
  }
  const desiredX = -(minX + maxX) / 2;
  const desiredZ = -(minZ + maxZ) / 2;
  const deltaX =
    maxX - minX <= WORKPLANE_HALF_MM * 2
      ? Math.min(Math.max(desiredX, -WORKPLANE_HALF_MM - minX), WORKPLANE_HALF_MM - maxX)
      : desiredX;
  const deltaZ =
    maxZ - minZ <= WORKPLANE_HALF_MM * 2
      ? Math.min(Math.max(desiredZ, -WORKPLANE_HALF_MM - minZ), WORKPLANE_HALF_MM - maxZ)
      : desiredZ;
  if (deltaX === 0 && deltaZ === 0) {
    return placed;
  }
  return placed.map((piece) => ({
    ...piece,
    position: { ...piece.position, x: piece.position.x + deltaX, z: piece.position.z + deltaZ },
  }));
}

/** Add a rotation step to one axis of every selected piece. */
export function addPiecesRotation(
  placed: readonly PlacedPiece[],
  selectedIds: readonly string[],
  axis: keyof RotationDeg,
  delta: number,
): readonly PlacedPiece[] {
  if (selectedIds.length === 0) {
    return placed;
  }
  const selected = new Set(selectedIds);
  return placed.map((piece) =>
    selected.has(piece.id)
      ? { ...piece, rotation: addRotation(piece.rotation, axis, delta) }
      : piece,
  );
}

/** Set one axis of every selected piece to an absolute angle. */
export function setPiecesRotation(
  placed: readonly PlacedPiece[],
  selectedIds: readonly string[],
  axis: keyof RotationDeg,
  degrees: number,
): readonly PlacedPiece[] {
  if (selectedIds.length === 0) {
    return placed;
  }
  const selected = new Set(selectedIds);
  return placed.map((piece) =>
    selected.has(piece.id)
      ? { ...piece, rotation: setRotation(piece.rotation, axis, degrees) }
      : piece,
  );
}

/** Flip one axis of every selected piece 180°. */
export function flipPiecesRotation(
  placed: readonly PlacedPiece[],
  selectedIds: readonly string[],
  axis: keyof RotationDeg,
): readonly PlacedPiece[] {
  if (selectedIds.length === 0) {
    return placed;
  }
  const selected = new Set(selectedIds);
  return placed.map((piece) =>
    selected.has(piece.id) ? { ...piece, rotation: flipRotation(piece.rotation, axis) } : piece,
  );
}

/** Reset every selected piece to no rotation, keeping its position. */
export function resetPiecesRotation(
  placed: readonly PlacedPiece[],
  selectedIds: readonly string[],
): readonly PlacedPiece[] {
  if (selectedIds.length === 0) {
    return placed;
  }
  const selected = new Set(selectedIds);
  return placed.map((piece) =>
    selected.has(piece.id) ? { ...piece, rotation: resetRotation() } : piece,
  );
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

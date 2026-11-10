import type { PlacedPiece } from './design';
import { isFastenerConnection } from './connections';

export const SAVED_DESIGNS_STORAGE_KEY = 'basiscad.saved-designs.v1';
export const RECOVERY_STORAGE_KEY = 'basiscad.recovery.v1';

export interface DesignDocument {
  id: string;
  name: string;
  placed: readonly PlacedPiece[];
  updatedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlacedPiece(value: unknown): value is PlacedPiece {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const piece = value as Partial<PlacedPiece>;
  return (
    typeof piece.id === 'string' &&
    typeof piece.libraryId === 'string' &&
    typeof piece.position === 'object' &&
    piece.position !== null &&
    isFiniteNumber(piece.position.x) &&
    isFiniteNumber(piece.position.y) &&
    isFiniteNumber(piece.position.z) &&
    typeof piece.rotation === 'object' &&
    piece.rotation !== null &&
    isFiniteNumber(piece.rotation.x) &&
    isFiniteNumber(piece.rotation.y) &&
    isFiniteNumber(piece.rotation.z) &&
    (piece.fastener === undefined || isFastenerConnection(piece.fastener)) &&
    (piece.locked === undefined || typeof piece.locked === 'boolean') &&
    (piece.hingeAngleDeg === undefined || isFiniteNumber(piece.hingeAngleDeg)) &&
    (piece.groupRotation === undefined ||
      (piece.groupRotation !== null &&
        typeof piece.groupRotation === 'object' &&
        isFiniteNumber(piece.groupRotation.x) &&
        isFiniteNumber(piece.groupRotation.y) &&
        isFiniteNumber(piece.groupRotation.z))) &&
    (piece.groupId === undefined || (typeof piece.groupId === 'string' && piece.groupId.length > 0))
  );
}

function isDesignDocument(value: unknown): value is DesignDocument {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const document = value as Partial<DesignDocument>;
  return (
    typeof document.id === 'string' &&
    typeof document.name === 'string' &&
    document.name.trim().length > 0 &&
    Array.isArray(document.placed) &&
    document.placed.every(isPlacedPiece) &&
    (!document.placed.some((piece) => piece.fastener) ||
      new Set(document.placed.map((piece) => piece.id)).size === document.placed.length) &&
    document.placed.every(
      (piece) =>
        !piece.fastener ||
        piece.fastener.holes.every((hole) =>
          document.placed!.some((other) => other.id === hole.pieceId && !other.fastener),
        ),
    ) &&
    isFiniteNumber(document.updatedAt)
  );
}

/** Older versions reused numeric IDs after reopening. Preserve every unattached piece while repairing them. */
function repairLegacyIds(document: DesignDocument): DesignDocument {
  const used = new Set(document.placed.map((piece) => piece.id));
  const seen = new Set<string>();
  let repaired = false;
  const placed = document.placed.map((piece) => {
    if (!seen.has(piece.id)) {
      seen.add(piece.id);
      return piece;
    }
    let suffix = 1;
    while (used.has(`${piece.id}-copy-${suffix}`)) suffix += 1;
    const id = `${piece.id}-copy-${suffix}`;
    used.add(id);
    seen.add(id);
    repaired = true;
    return { ...piece, id };
  });
  return repaired ? { ...document, placed } : document;
}

export function readSavedDesigns(storage: StorageLike): readonly DesignDocument[] {
  try {
    const raw = storage.getItem(SAVED_DESIGNS_STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(isDesignDocument).map(repairLegacyIds);
  } catch {
    return [];
  }
}

export function saveDesign(
  storage: StorageLike,
  design: DesignDocument,
): readonly DesignDocument[] {
  const designs = readSavedDesigns(storage).filter((saved) => saved.id !== design.id);
  const next = [...designs, design].sort((a, b) => b.updatedAt - a.updatedAt);
  storage.setItem(SAVED_DESIGNS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteSavedDesign(storage: StorageLike, id: string): readonly DesignDocument[] {
  const next = readSavedDesigns(storage).filter((design) => design.id !== id);
  storage.setItem(SAVED_DESIGNS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function readRecoveryDraft(storage: StorageLike): DesignDocument | null {
  try {
    const raw = storage.getItem(RECOVERY_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const value: unknown = JSON.parse(raw);
    return isDesignDocument(value) ? repairLegacyIds(value) : null;
  } catch {
    return null;
  }
}

export function writeRecoveryDraft(storage: StorageLike, draft: DesignDocument): void {
  storage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(draft));
}

export function clearRecoveryDraft(storage: StorageLike): void {
  storage.removeItem(RECOVERY_STORAGE_KEY);
}

export function recoveryMatchesSavedDesign(
  recovery: DesignDocument,
  saved: readonly DesignDocument[],
): boolean {
  const match = saved.find((design) => design.id === recovery.id);
  return (
    match !== undefined &&
    match.name === recovery.name &&
    JSON.stringify(match.placed) === JSON.stringify(recovery.placed)
  );
}

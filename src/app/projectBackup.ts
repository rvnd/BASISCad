import { SPEC_PIECES } from './library';
import { isDesignDocument } from './projects';
import type { DesignDocument } from './projects';

export const BACKUP_MAX_BYTES = 64 * 1024 * 1024;
export const BACKUP_VERSION = 1;

/** Validate identities and references before replacing any open project. */
export function validateProject(document: DesignDocument): void {
  const pieces = new Map(document.placed.map((piece) => [piece.id, piece]));
  if (pieces.size !== document.placed.length || document.placed.some((piece) => !piece.id))
    throw new Error('The backup contains duplicate or empty piece IDs.');
  const spec = new Map(SPEC_PIECES.map((piece) => [piece.id, piece]));
  const imports = new Set((document.imports ?? []).map((asset) => asset.id));
  if (imports.size !== (document.imports ?? []).length || [...imports].some((id) => spec.has(id)))
    throw new Error('The backup contains conflicting imported piece IDs.');
  for (const piece of document.placed) {
    if (!piece.fastener && !spec.has(piece.libraryId) && !imports.has(piece.libraryId))
      throw new Error(
        `Missing geometry for "${piece.libraryId}". Import its original mesh before exporting.`,
      );
    for (const hole of piece.fastener?.holes ?? []) {
      const stock = pieces.get(hole.pieceId);
      const count = stock ? spec.get(stock.libraryId)?.holeCount : null;
      if (
        !stock ||
        stock.fastener ||
        (count !== null && count !== undefined && hole.holeIndex >= count)
      )
        throw new Error('The backup contains an invalid screw connection.');
    }
  }
}

export function serializeBackup(document: DesignDocument): string {
  if (!isDesignDocument(document)) throw new Error('The design cannot be exported.');
  validateProject(document);
  const text = JSON.stringify({
    format: 'BASISCad',
    version: BACKUP_VERSION,
    units: 'mm',
    document,
  });
  if (new TextEncoder().encode(text).byteLength > BACKUP_MAX_BYTES)
    throw new Error('This backup exceeds the 64 MB file limit.');
  return text + '\n';
}

export function parseBackup(text: string): DesignDocument {
  if (new TextEncoder().encode(text).byteLength > BACKUP_MAX_BYTES)
    throw new Error('This backup exceeds the 64 MB file limit.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Choose a BASISCad backup.');
  }
  if (typeof value !== 'object' || value === null)
    throw new Error('This file is not a BASISCad backup.');
  const file = value as {
    format?: unknown;
    version?: unknown;
    units?: unknown;
    document?: unknown;
  };
  if (file.format !== 'BASISCad') throw new Error('This file is not a BASISCad backup.');
  if (file.version !== BACKUP_VERSION) throw new Error('This backup version is unsupported.');
  if (file.units !== 'mm' || !isDesignDocument(file.document))
    throw new Error('The backup contains invalid design data.');
  validateProject(file.document);
  return file.document;
}

export function backupFilename(name: string): string {
  return `${
    name
      .trim()
      .replace(/[^a-z0-9._-]+/gi, '-')
      .slice(0, 80) || 'design'
  }.basiscad.json`;
}

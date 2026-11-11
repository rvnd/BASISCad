import type { PieceCategory } from './library';

/** Normalized triangle geometry, encoded as little-endian float32 base64. */
export interface ImportedPieceAsset {
  id: string;
  name: string;
  category: PieceCategory;
  colourName: string;
  colourHex: string;
  positions: string;
  normals: string;
}

export function isImportedPieceAsset(value: unknown): value is ImportedPieceAsset {
  if (typeof value !== 'object' || value === null) return false;
  const asset = value as Partial<ImportedPieceAsset>;
  return (
    typeof asset.id === 'string' &&
    asset.id.length > 0 &&
    typeof asset.name === 'string' &&
    asset.name.trim().length > 0 &&
    ['girders', 'braces', 'plates'].includes(asset.category ?? '') &&
    typeof asset.colourName === 'string' &&
    typeof asset.colourHex === 'string' &&
    /^#[0-9a-f]{6}$/i.test(asset.colourHex) &&
    typeof asset.positions === 'string' &&
    asset.positions.length > 0 &&
    typeof asset.normals === 'string' &&
    asset.normals.length === asset.positions.length
  );
}

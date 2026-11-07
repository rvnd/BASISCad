import { describe, expect, it } from 'vitest';
import {
  PIECE_CATEGORIES,
  SPEC_PIECES,
  bundledPieces,
  hasModelFile,
  holeCountLabel,
  isPieceReady,
  missingStlPieces,
  piecesInCategory,
} from './library';

describe('library', () => {
  it('has exactly 17 spec pieces', () => {
    expect(SPEC_PIECES).toHaveLength(17);
  });

  it('splits 9 girders, 5 braces, 3 plates', () => {
    expect(piecesInCategory(SPEC_PIECES, 'girders')).toHaveLength(9);
    expect(piecesInCategory(SPEC_PIECES, 'braces')).toHaveLength(5);
    expect(piecesInCategory(SPEC_PIECES, 'plates')).toHaveLength(3);
  });

  it('has the three categories in order', () => {
    expect(PIECE_CATEGORIES.map((category) => category.id)).toEqual([
      'girders',
      'braces',
      'plates',
    ]);
  });

  it('gives every girder its N holes (1xN has N holes)', () => {
    const girders = piecesInCategory(SPEC_PIECES, 'girders');
    expect(girders.map((piece) => piece.holeCount)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('gives every brace and plate its hole count, from the recovered geometry', () => {
    const braces = piecesInCategory(SPEC_PIECES, 'braces');
    // 1x2 Brace 3, H-Brace 4, V-Brace 4, L-Brace 4, S-Brace 2.
    expect(braces.map((piece) => piece.holeCount)).toEqual([3, 4, 4, 4, 2]);
    const plates = piecesInCategory(SPEC_PIECES, 'plates');
    // Team Plate 2, 2x2 Panel 4, 2x3 Panel 6.
    expect(plates.map((piece) => piece.holeCount)).toEqual([2, 4, 6]);
  });

  it('records every piece size in the app Y-up frame', () => {
    const byId = new Map(SPEC_PIECES.map((piece) => [piece.id, piece]));
    expect(byId.get('girder-1x4')?.sizeMm).toEqual({ x: 50.95, y: 3.175, z: 12.7 });
    expect(byId.get('girder-1x12')?.sizeMm).toEqual({ x: 152.77, y: 3.175, z: 12.7 });
    // Braces stand up: their height (y) is the arm length, not the thickness.
    expect(byId.get('brace-l')?.sizeMm).toEqual({ x: 31.54, y: 31.54, z: 12.7 });
    expect(byId.get('plate-2x3')?.sizeMm).toEqual({ x: 25.47, y: 3.175, z: 38.1 });
    for (const piece of SPEC_PIECES) {
      expect(piece.sizeMm).not.toBeNull();
      expect(piece.holeCount).not.toBeNull();
    }
  });

  it('bundles an STL file for all 17 spec pieces — none is missing', () => {
    expect(bundledPieces()).toHaveLength(17);
    for (const piece of bundledPieces()) {
      expect(piece.bundledFile?.file).toMatch(/^library\/.*\.stl$/);
      expect(piece.geometryId).toBeNull();
      expect(isPieceReady(piece)).toBe(false);
    }
    expect(missingStlPieces()).toHaveLength(0);
  });

  it('labels known and unknown hole counts honestly', () => {
    const girder1x4 = SPEC_PIECES.find((piece) => piece.id === 'girder-1x4');
    expect(girder1x4 === undefined ? '' : holeCountLabel(girder1x4)).toBe('4 holes');
    const imported = {
      id: 'imported-1',
      name: 'Imported piece',
      category: 'girders' as const,
      colourName: 'Grey',
      colourHex: '#808080',
      holeCount: null,
      sizeMm: { x: 10, y: 2, z: 5 },
      source: 'import' as const,
      geometryId: null,
    };
    expect(holeCountLabel(imported)).toBe('holes: ?');
  });

  it('has a model file for all 17 spec pieces — the Shapes panel lists all of them', () => {
    expect(SPEC_PIECES.filter(hasModelFile)).toHaveLength(17);
  });

  it('counts an imported piece as having a model file once it has geometry', () => {
    const imported = {
      id: 'imported-1',
      name: 'Imported piece',
      category: 'girders' as const,
      colourName: 'Grey',
      colourHex: '#808080',
      holeCount: null,
      sizeMm: { x: 10, y: 2, z: 5 },
      source: 'import' as const,
      geometryId: null,
    };
    expect(hasModelFile(imported)).toBe(false);
    expect(hasModelFile({ ...imported, geometryId: 'imported-1' })).toBe(true);
  });

  it('has no duplicate piece ids', () => {
    const ids = SPEC_PIECES.map((piece) => piece.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

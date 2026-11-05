import { describe, expect, it } from 'vitest';
import {
  PIECE_CATEGORIES,
  SPEC_PIECES,
  hasModelFile,
  holeCountLabel,
  isPieceReady,
  missingStlPieces,
  piecesInCategory,
  standInPieces,
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

  it('gives the panels their hole counts and leaves the Team Plate unknown', () => {
    const plates = piecesInCategory(SPEC_PIECES, 'plates');
    expect(plates.map((piece) => piece.holeCount)).toEqual([null, 4, 6]);
  });

  it('does not guess brace hole counts', () => {
    for (const brace of piecesInCategory(SPEC_PIECES, 'braces')) {
      expect(brace.holeCount).toBeNull();
    }
  });

  it('records the 1x4 girder size and leaves sizes unknown except for the stand-ins', () => {
    const girder1x4 = SPEC_PIECES.find((piece) => piece.id === 'girder-1x4');
    expect(girder1x4?.sizeMm).toEqual({ x: 50.95, y: 3.175, z: 12.7 });
    const withSize = SPEC_PIECES.filter((piece) => piece.sizeMm !== null).map((piece) => piece.id);
    // The 1x4 (spec) plus the three temporary stand-ins, whose sizes
    // are recorded as imported.
    expect(withSize).toEqual(['girder-1x4', 'girder-1x6', 'brace-l', 'plate-2x2']);
  });

  it('has three temporary stand-ins, all CC0, all still missing their real STL', () => {
    const standIns = standInPieces();
    expect(standIns.map((piece) => piece.id)).toEqual(['girder-1x6', 'brace-l', 'plate-2x2']);
    for (const piece of standIns) {
      expect(piece.standIn?.licence).toBe('CC0 1.0');
      expect(piece.standIn?.file).toMatch(/^library\/.*\.stl$/);
      expect(piece.geometryId).toBeNull();
      expect(isPieceReady(piece)).toBe(false);
    }
    expect(missingStlPieces()).toHaveLength(17);
  });

  it('marks all 17 spec pieces as missing their STL', () => {
    expect(missingStlPieces()).toHaveLength(17);
    for (const piece of SPEC_PIECES) {
      expect(piece.geometryId).toBeNull();
      expect(isPieceReady(piece)).toBe(false);
    }
  });

  it('labels known and unknown hole counts honestly', () => {
    const girder1x4 = SPEC_PIECES.find((piece) => piece.id === 'girder-1x4');
    const hBrace = SPEC_PIECES.find((piece) => piece.id === 'brace-h');
    expect(girder1x4 === undefined ? '' : holeCountLabel(girder1x4)).toBe('4 holes');
    expect(hBrace === undefined ? '' : holeCountLabel(hBrace)).toBe('holes: ?');
  });

  it('has a model file only for the three stand-ins — the Shapes panel lists just these', () => {
    const withFile = SPEC_PIECES.filter(hasModelFile).map((piece) => piece.id);
    expect(withFile).toEqual(['girder-1x6', 'brace-l', 'plate-2x2']);
    // The other 14 spec pieces are hidden from the panel, not deleted:
    // the 17-piece spec data above is unchanged.
    expect(SPEC_PIECES).toHaveLength(17);
    const girder1x4 = SPEC_PIECES.find((piece) => piece.id === 'girder-1x4');
    expect(girder1x4 === undefined ? true : hasModelFile(girder1x4)).toBe(false);
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

/**
 * The piece library — the 17 reusable pieces from the prototype, plus
 * pieces the user imports from STL/OBJ files.
 *
 * The 17 spec pieces have NO geometry in the repo: their STLs are
 * uncollected (Milestone 2's blocking step). Nothing here invents a
 * shape for them, and nothing guesses a hole count the spec does not
 * establish. A spec piece is listed with its name, category, colour,
 * and known hole count — or `holeCount: null` when the count is not
 * established — and its status is `stl-needed` until its STL is
 * imported. Only pieces with real geometry (imported in this session)
 * are `ready` and placeable.
 *
 * Hole counts the spec actually establishes:
 * - a 1xN girder has N holes (the 1x4 girder costs $4 at $1/hole);
 * - the 2x2 Panel has 4 holes and the 2x3 Panel has 6 holes.
 * Brace hole counts and the Team Plate's hole count are NOT established
 * anywhere in the prototype transcript, so they are `null` here.
 *
 * Sizes: only the 1x4 Girder's size is established (50.95 x 12.70 x
 * 3.175 mm). Every other piece's size is `null` until its STL arrives.
 * Imported pieces get their size from their geometry's bounding box.
 *
 * Colours are the named colours from the prototype table, as standard
 * hex values. The red girder uses the brand red (#D03F43). These are
 * the colours the panel shows; the exact Tinkercad shades come with
 * the STLs if they ever differ.
 */

export type PieceCategory = 'girders' | 'braces' | 'plates';

export const PIECE_CATEGORIES: readonly {
  id: PieceCategory;
  label: string;
}[] = [
  { id: 'girders', label: 'Girders' },
  { id: 'braces', label: 'Braces' },
  { id: 'plates', label: 'Plates' },
];

/** The named colours used by the library, as hex values. */
export const PIECE_COLOURS: readonly { name: string; hex: string }[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Orange', hex: '#FF7F00' },
  { name: 'Yellow', hex: '#FFD500' },
  { name: 'Green', hex: '#2FA84F' },
  { name: 'Grey', hex: '#808080' },
  { name: 'Blue', hex: '#1E6FD9' },
  { name: 'Black', hex: '#000000' },
  { name: 'Purple', hex: '#7B2FBE' },
  { name: 'Red', hex: '#D03F43' },
  { name: 'Gold', hex: '#D4AF37' },
];

/** A piece's size in millimetres: x (length), y (thickness), z (width). */
export interface PieceSizeMm {
  x: number;
  y: number;
  z: number;
}

/**
 * A temporary stand-in STL for a spec piece, from the internet (see
 * `public/library/LIBRARY_SOURCES.md`). The file is bundled with the
 * site and loaded at startup; the piece stays "STL needed" until its
 * real STL arrives, and the stand-in is replaced then.
 */
export interface StandInSource {
  /** Path under `public/`, e.g. 'library/apu-rack-mount.stl'. */
  file: string;
  /** Where the file came from. */
  sourceUrl: string;
  /** Licence of the file, e.g. 'CC0 1.0'. */
  licence: string;
}

/**
 * One entry in the library. `source: 'spec'` entries are the 17 pieces
 * from the prototype and have no geometry until their STL is imported
 * (`geometryId` is null). `source: 'import'` entries were loaded from a
 * user file in this session; their geometry lives in the geometry
 * registry (`src/three/libraryGeometry.ts`) under `geometryId`.
 */
export interface LibraryPiece {
  id: string;
  name: string;
  category: PieceCategory;
  colourName: string;
  colourHex: string;
  /** Number of holes, or null when not established. Drives the budget. */
  holeCount: number | null;
  /** Size in mm, or null when unknown (no STL yet). */
  sizeMm: PieceSizeMm | null;
  source: 'spec' | 'import';
  /** Key into the geometry registry, or null when there is no geometry. */
  geometryId: string | null;
  /** Temporary stand-in file, if this piece has one; undefined otherwise. */
  standIn?: StandInSource;
}

/** True when the piece has geometry and can be placed on the workplane. */
export function isPieceReady(piece: LibraryPiece): boolean {
  return piece.geometryId !== null;
}

/** The 17 spec pieces, in the prototype's order, grouped by category. */
export const SPEC_PIECES: readonly LibraryPiece[] = [
  // Girders (9): a 1xN girder has N holes.
  {
    id: 'girder-1x4',
    name: '1x4 Girder',
    category: 'girders',
    colourName: 'White',
    colourHex: '#FFFFFF',
    holeCount: 4,
    sizeMm: { x: 50.95, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'girder-1x5',
    name: '1x5 Girder',
    category: 'girders',
    colourName: 'Orange',
    colourHex: '#FF7F00',
    holeCount: 5,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'girder-1x6',
    name: '1x6 Girder',
    category: 'girders',
    colourName: 'Yellow',
    colourHex: '#FFD500',
    holeCount: 6,
    // Temporary stand-in size, as imported (see LIBRARY_SOURCES.md).
    sizeMm: { x: 178, y: 8, z: 51.4 },
    source: 'spec',
    geometryId: null,
    standIn: {
      file: 'library/apu-rack-mount.stl',
      sourceUrl:
        'https://github.com/azdle/printables/blob/master/rack-mount-stuff/apu-rack-mount.stl',
      licence: 'CC0 1.0',
    },
  },
  {
    id: 'girder-1x7',
    name: '1x7 Girder',
    category: 'girders',
    colourName: 'Green',
    colourHex: '#2FA84F',
    holeCount: 7,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'girder-1x8',
    name: '1x8 Girder',
    category: 'girders',
    colourName: 'Grey',
    colourHex: '#808080',
    holeCount: 8,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'girder-1x9',
    name: '1x9 Girder',
    category: 'girders',
    colourName: 'Blue',
    colourHex: '#1E6FD9',
    holeCount: 9,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'girder-1x10',
    name: '1x10 Girder',
    category: 'girders',
    colourName: 'Black',
    colourHex: '#000000',
    holeCount: 10,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'girder-1x11',
    name: '1x11 Girder',
    category: 'girders',
    colourName: 'Purple',
    colourHex: '#7B2FBE',
    holeCount: 11,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'girder-1x12',
    name: '1x12 Girder',
    category: 'girders',
    colourName: 'Red',
    colourHex: '#D03F43',
    holeCount: 12,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  // Braces (5): hole counts are NOT established — null, never guessed.
  {
    id: 'brace-1x2',
    name: '1x2 Brace',
    category: 'braces',
    colourName: 'Grey',
    colourHex: '#808080',
    holeCount: null,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'brace-h',
    name: 'H-Brace',
    category: 'braces',
    colourName: 'White',
    colourHex: '#FFFFFF',
    holeCount: null,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'brace-v',
    name: 'V-Brace',
    category: 'braces',
    colourName: 'Green',
    colourHex: '#2FA84F',
    holeCount: null,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'brace-l',
    name: 'L-Brace',
    category: 'braces',
    colourName: 'Red',
    colourHex: '#D03F43',
    holeCount: null,
    // Temporary stand-in size, as imported (see LIBRARY_SOURCES.md).
    sizeMm: { x: 22, y: 16, z: 32 },
    source: 'spec',
    geometryId: null,
    standIn: {
      file: 'library/l-bracket.stl',
      sourceUrl: 'https://github.com/azdle/printables/blob/master/l-bracket/l-bracket.stl',
      licence: 'CC0 1.0',
    },
  },
  {
    id: 'brace-s',
    name: 'S-Brace',
    category: 'braces',
    colourName: 'Blue',
    colourHex: '#1E6FD9',
    holeCount: null,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  // Plates (3): 2x2 has 4 holes, 2x3 has 6; the Team Plate is unknown.
  {
    id: 'plate-team',
    name: 'Team Plate',
    category: 'plates',
    colourName: 'Gold',
    colourHex: '#D4AF37',
    holeCount: null,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
  {
    id: 'plate-2x2',
    name: '2x2 Panel',
    category: 'plates',
    colourName: 'Red',
    colourHex: '#D03F43',
    holeCount: 4,
    // Temporary stand-in size, as imported (see LIBRARY_SOURCES.md).
    sizeMm: { x: 48, y: 5, z: 91 },
    source: 'spec',
    geometryId: null,
    standIn: {
      file: 'library/pc-board-mount.stl',
      sourceUrl: 'https://github.com/azdle/printables/blob/master/unsorted/pc-board-mount.stl',
      licence: 'CC0 1.0',
    },
  },
  {
    id: 'plate-2x3',
    name: '2x3 Panel',
    category: 'plates',
    colourName: 'Red',
    colourHex: '#D03F43',
    holeCount: 6,
    sizeMm: null,
    source: 'spec',
    geometryId: null,
  },
];

/** The 17 spec pieces that still need their STL collected. */
export function missingStlPieces(): readonly LibraryPiece[] {
  return SPEC_PIECES.filter((piece) => piece.geometryId === null);
}

/**
 * Spec pieces with a temporary stand-in file. The stand-in gives the
 * piece geometry to demo with, but the real STL is still missing —
 * these pieces are still in `missingStlPieces()` until it arrives.
 */
export function standInPieces(): readonly LibraryPiece[] {
  return SPEC_PIECES.filter((piece) => piece.standIn !== undefined);
}

/** Pieces in one category, in library order. */
export function piecesInCategory(
  pieces: readonly LibraryPiece[],
  category: PieceCategory,
): readonly LibraryPiece[] {
  return pieces.filter((piece) => piece.category === category);
}

/** Display text for a piece's hole count: "4 holes", or "holes: ?" when unknown. */
export function holeCountLabel(piece: LibraryPiece): string {
  return piece.holeCount === null ? 'holes: ?' : `${piece.holeCount} holes`;
}

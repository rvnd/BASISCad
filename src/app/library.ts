/**
 * The piece library — the 17 reusable pieces from the prototype, plus
 * pieces the user imports from STL/OBJ files.
 *
 * All 17 spec pieces now have real geometry: bundled STL files in
 * `public/library/`, recovered from the prototype's own geometry
 * (see `public/library/LIBRARY_SOURCES.md` and
 * `scripts/generate-library-stls/`). Each entry records its name,
 * category, colour, hole count, and size — all established from the
 * recovered geometry, never guessed:
 *
 * - a 1xN girder has N holes; girder lengths step 12.7 mm per hole
 *   (1x4 is 50.95 mm long, 1x12 is 152.77 mm), all 12.70 mm wide
 *   and 3.175 mm thick;
 * - hole diameter is 4.196 mm (radius 2.098 mm) on every hole, which
 *   clears a #6-32 screw (3.505 mm across);
 * - the braces and Team Plate hole counts come from the recovered
 *   geometry (verified by mesh genus): 1x2 Brace 3, H-Brace 4,
 *   V-Brace 4, L-Brace 4, S-Brace 2, Team Plate 2.
 *
 * Sizes are in millimetres in the app's Y-up frame: x (length),
 * y (thickness/height), z (width). Imported pieces get their size
 * from their geometry's bounding box. A piece whose hole count or
 * size is not established (only user imports, never a spec piece)
 * uses `null` — never a guess.
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
 * A bundled STL file for a spec piece, in `public/library/` — see
 * `public/library/LIBRARY_SOURCES.md` for provenance.
 */
export interface BundledFile {
  /** Path under `public/`, e.g. 'library/girder-1x4.stl'. */
  file: string;
}

/**
 * One entry in the library. `source: 'spec'` entries are the 17 pieces
 * from the prototype; each has a bundled STL (`bundledFile`) loaded at
 * startup, and `geometryId` is set once it has loaded. `source:
 * 'import'` entries were loaded from a user file in this session;
 * their geometry lives in the geometry registry
 * (`src/three/libraryGeometry.ts`) under `geometryId`.
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
  /** Bundled STL file, if this piece has one; undefined otherwise. */
  bundledFile?: BundledFile;
}

/** True when the piece has geometry and can be placed on the workplane. */
export function isPieceReady(piece: LibraryPiece): boolean {
  return piece.geometryId !== null;
}

/**
 * True when the piece has a model file available: a bundled STL, or
 * geometry imported in this session. The Shapes panel lists only
 * these pieces. All 17 spec pieces have a bundled file, so all 17
 * are listed.
 */
export function hasModelFile(piece: LibraryPiece): boolean {
  return piece.bundledFile !== undefined || piece.geometryId !== null;
}

/** The 17 spec pieces, in the prototype's order, grouped by category. */
export const SPEC_PIECES: readonly LibraryPiece[] = [
  // Girders (9): a 1xN girder has N holes; all 12.70 mm wide,
  // 3.175 mm thick, length stepping 12.7 mm per hole.
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
    bundledFile: { file: 'library/girder-1x4.stl' },
  },
  {
    id: 'girder-1x5',
    name: '1x5 Girder',
    category: 'girders',
    colourName: 'Orange',
    colourHex: '#FF7F00',
    holeCount: 5,
    sizeMm: { x: 63.65, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/girder-1x5.stl' },
  },
  {
    id: 'girder-1x6',
    name: '1x6 Girder',
    category: 'girders',
    colourName: 'Yellow',
    colourHex: '#FFD500',
    holeCount: 6,
    sizeMm: { x: 76.57, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/girder-1x6.stl' },
  },
  {
    id: 'girder-1x7',
    name: '1x7 Girder',
    category: 'girders',
    colourName: 'Green',
    colourHex: '#2FA84F',
    holeCount: 7,
    sizeMm: { x: 89.27, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/girder-1x7.stl' },
  },
  {
    id: 'girder-1x8',
    name: '1x8 Girder',
    category: 'girders',
    colourName: 'Grey',
    colourHex: '#808080',
    holeCount: 8,
    sizeMm: { x: 101.97, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/girder-1x8.stl' },
  },
  {
    id: 'girder-1x9',
    name: '1x9 Girder',
    category: 'girders',
    colourName: 'Blue',
    colourHex: '#1E6FD9',
    holeCount: 9,
    sizeMm: { x: 114.67, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/girder-1x9.stl' },
  },
  {
    id: 'girder-1x10',
    name: '1x10 Girder',
    category: 'girders',
    colourName: 'Black',
    colourHex: '#000000',
    holeCount: 10,
    sizeMm: { x: 127.37, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/girder-1x10.stl' },
  },
  {
    id: 'girder-1x11',
    name: '1x11 Girder',
    category: 'girders',
    colourName: 'Purple',
    colourHex: '#7B2FBE',
    holeCount: 11,
    sizeMm: { x: 140.07, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/girder-1x11.stl' },
  },
  {
    id: 'girder-1x12',
    name: '1x12 Girder',
    category: 'girders',
    colourName: 'Red',
    colourHex: '#D03F43',
    holeCount: 12,
    sizeMm: { x: 152.77, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/girder-1x12.stl' },
  },
  // Braces (5): hole counts from the recovered geometry (mesh genus).
  {
    id: 'brace-1x2',
    name: '1x2 Brace',
    category: 'braces',
    colourName: 'Grey',
    colourHex: '#808080',
    holeCount: 3,
    sizeMm: { x: 12.7, y: 18.84, z: 31.54 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/brace-1x2.stl' },
  },
  {
    id: 'brace-h',
    name: 'H-Brace',
    category: 'braces',
    colourName: 'White',
    colourHex: '#FFFFFF',
    holeCount: 4,
    sizeMm: { x: 38.25, y: 31.82, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/brace-h.stl' },
  },
  {
    id: 'brace-v',
    name: 'V-Brace',
    category: 'braces',
    colourName: 'Green',
    colourHex: '#2FA84F',
    holeCount: 4,
    sizeMm: { x: 25.55, y: 31.82, z: 12.78 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/brace-v.stl' },
  },
  {
    id: 'brace-l',
    name: 'L-Brace',
    category: 'braces',
    colourName: 'Red',
    colourHex: '#D03F43',
    holeCount: 4,
    sizeMm: { x: 31.54, y: 31.54, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/brace-l.stl' },
  },
  {
    id: 'brace-s',
    name: 'S-Brace',
    category: 'braces',
    colourName: 'Blue',
    colourHex: '#1E6FD9',
    holeCount: 2,
    sizeMm: { x: 18.84, y: 18.84, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/brace-s.stl' },
  },
  // Plates (3): 2x2 has 4 holes, 2x3 has 6, Team Plate has 2.
  {
    id: 'plate-team',
    name: 'Team Plate',
    category: 'plates',
    colourName: 'Gold',
    colourHex: '#D4AF37',
    holeCount: 2,
    sizeMm: { x: 50.95, y: 3.175, z: 12.7 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/plate-team.stl' },
  },
  {
    id: 'plate-2x2',
    name: '2x2 Panel',
    category: 'plates',
    colourName: 'Red',
    colourHex: '#D03F43',
    holeCount: 4,
    sizeMm: { x: 25.47, y: 3.175, z: 25.4 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/plate-2x2.stl' },
  },
  {
    id: 'plate-2x3',
    name: '2x3 Panel',
    category: 'plates',
    colourName: 'Red',
    colourHex: '#D03F43',
    holeCount: 6,
    sizeMm: { x: 25.47, y: 3.175, z: 38.1 },
    source: 'spec',
    geometryId: null,
    bundledFile: { file: 'library/plate-2x3.stl' },
  },
];

/** Spec pieces with no bundled STL — none right now; all 17 are bundled. */
export function missingStlPieces(): readonly LibraryPiece[] {
  return SPEC_PIECES.filter((piece) => piece.bundledFile === undefined);
}

/** Spec pieces with a bundled STL file (all 17). */
export function bundledPieces(): readonly LibraryPiece[] {
  return SPEC_PIECES.filter((piece) => piece.bundledFile !== undefined);
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

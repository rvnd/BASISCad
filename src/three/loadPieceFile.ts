import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PieceSizeMm } from '../app/library';

/**
 * Load a user-imported STL or OBJ file into a Three.js geometry.
 *
 * The geometry keeps its original size exactly — it is never rescaled
 * to fit a grid. Two position-only adjustments are made:
 *
 * 1. Orientation: STLs from 3D printing are usually Z-up (the part
 *    lies flat in the XY plane, thickness along Z). This app is Y-up,
 *    so when the bounding box is thinnest along Z the geometry is
 *    rotated -90° about X, putting the thickness along Y and the part
 *    flat on the workplane. Size is unchanged — only the orientation
 *    moves.
 * 2. Position: translated so its footprint is centred on the origin
 *    in X/Z and its lowest point sits on y = 0, so a placed piece sits
 *    on the workplane the way the spec requires (nothing below the
 *    workplane).
 */

export interface LoadedPieceGeometry {
  geometry: THREE.BufferGeometry;
  /** Size in mm, from the geometry's bounding box. */
  sizeMm: PieceSizeMm;
}

/** File extensions this loader accepts (lowercase, with the dot). */
export const SUPPORTED_PIECE_EXTENSIONS: readonly string[] = ['.stl', '.obj'];

/** True for a filename we know how to load. */
export function isSupportedPieceFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_PIECE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Size of a geometry in mm, from its bounding box. */
export function measureGeometry(geometry: THREE.BufferGeometry): PieceSizeMm {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) {
    throw new Error('Could not measure the imported geometry.');
  }
  const size = new THREE.Vector3();
  box.getSize(size);
  return { x: size.x, y: size.y, z: size.z };
}

/**
 * Lay a Z-up geometry flat: when the bounding box is thinnest along Z
 * (the usual 3D-printing orientation), rotate -90° about X so the
 * thickness runs along Y. Size is unchanged.
 */
export function orientFlat(geometry: THREE.BufferGeometry): void {
  const size = measureGeometry(geometry);
  if (size.z < size.x && size.z < size.y) {
    geometry.rotateX(-Math.PI / 2);
  }
}

/**
 * Centre a geometry's footprint on the origin and put its lowest point
 * on y = 0. Size is unchanged — only the position moves.
 */
export function normaliseGeometryPosition(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) {
    throw new Error('Could not measure the imported geometry.');
  }
  const centre = new THREE.Vector3();
  box.getCenter(centre);
  geometry.translate(-centre.x, -box.min.y, -centre.z);
}

function parseStl(arrayBuffer: ArrayBuffer): THREE.BufferGeometry {
  return new STLLoader().parse(arrayBuffer);
}

function parseObj(text: string): THREE.BufferGeometry {
  const group = new OBJLoader().parse(text);
  const parts: THREE.BufferGeometry[] = [];
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      parts.push(geometry.index === null ? geometry : geometry.toNonIndexed());
    }
  });
  if (parts.length === 0) {
    throw new Error('The OBJ file contains no mesh geometry.');
  }
  const merged = mergeGeometries(parts, false);
  if (merged === null) {
    throw new Error('Could not merge the OBJ file geometry.');
  }
  for (const part of parts) {
    part.dispose();
  }
  return merged;
}

function checkGeometry(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  if (position === undefined || position.count === 0) {
    throw new Error('The file contains no geometry to import.');
  }
}

/**
 * Parse raw file data (ArrayBuffer for .stl, text for .obj is decoded
 * from the buffer) into an oriented, normalised geometry plus its size.
 * Throws an Error with a plain message when the data cannot be used.
 */
export function parsePieceGeometry(data: ArrayBuffer, fileName: string): LoadedPieceGeometry {
  const lower = fileName.toLowerCase();
  let geometry: THREE.BufferGeometry;
  if (lower.endsWith('.stl')) {
    geometry = parseStl(data);
  } else if (lower.endsWith('.obj')) {
    geometry = parseObj(new TextDecoder().decode(data));
  } else {
    throw new Error('Only .stl and .obj files can be imported.');
  }
  checkGeometry(geometry);
  orientFlat(geometry);
  normaliseGeometryPosition(geometry);
  return { geometry, sizeMm: measureGeometry(geometry) };
}

/**
 * Load a .stl or .obj File into an oriented, normalised geometry plus
 * its size. Throws an Error with a plain message when the file cannot
 * be used.
 */
export async function loadPieceGeometry(file: File): Promise<LoadedPieceGeometry> {
  return parsePieceGeometry(await file.arrayBuffer(), file.name);
}

/**
 * Load a .stl or .obj file from a URL (used for the bundled temporary
 * stand-in STLs in `public/library/`). Throws when the fetch fails or
 * the file cannot be used.
 */
export async function loadPieceGeometryFromUrl(url: string): Promise<LoadedPieceGeometry> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status}).`);
  }
  return parsePieceGeometry(await response.arrayBuffer(), url);
}

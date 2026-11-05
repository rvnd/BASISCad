import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PieceSizeMm } from '../app/library';

/**
 * Load a user-imported STL or OBJ file into a Three.js geometry.
 *
 * The geometry keeps its original size exactly — it is never rescaled
 * to fit a grid. It is only repositioned: translated so its footprint
 * is centred on the origin in X/Z and its lowest point sits on y = 0,
 * so a placed piece sits on the workplane the way the spec requires
 * (nothing below the workplane). Position changes; size does not.
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
 * Load a .stl or .obj File into a normalised geometry plus its size.
 * Throws an Error with a plain message when the file cannot be used.
 */
export async function loadPieceGeometry(file: File): Promise<LoadedPieceGeometry> {
  const lower = file.name.toLowerCase();
  let geometry: THREE.BufferGeometry;
  if (lower.endsWith('.stl')) {
    geometry = parseStl(await file.arrayBuffer());
  } else if (lower.endsWith('.obj')) {
    geometry = parseObj(await file.text());
  } else {
    throw new Error('Only .stl and .obj files can be imported.');
  }
  checkGeometry(geometry);
  normaliseGeometryPosition(geometry);
  return { geometry, sizeMm: measureGeometry(geometry) };
}

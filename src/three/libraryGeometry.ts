import type * as THREE from 'three';

/**
 * Geometry registry for imported pieces.
 *
 * React state holds only library metadata (see `src/app/library.ts`);
 * the actual Three.js geometry lives here, keyed by the imported
 * piece's `geometryId`. This keeps React from ever holding Three.js
 * objects, matching the viewport convention. Geometries are session
 * only — full persistence arrives with saving in Milestone 5.
 */

const geometries = new Map<string, THREE.BufferGeometry>();

export function registerGeometry(id: string, geometry: THREE.BufferGeometry): void {
  const previous = geometries.get(id);
  if (previous && previous !== geometry) previous.dispose();
  geometries.set(id, geometry);
}

export function releaseGeometry(id: string): void {
  geometries.get(id)?.dispose();
  geometries.delete(id);
}

export function getGeometry(id: string): THREE.BufferGeometry | undefined {
  return geometries.get(id);
}

export function hasGeometry(id: string): boolean {
  return geometries.has(id);
}

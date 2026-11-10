import * as THREE from 'three';
import type { RotationDeg } from '../app/design';

interface CachedGeometry {
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  version: number;
  vertices: readonly THREE.Vector3[];
  rotations: Map<string, THREE.Box3>;
}
const cache = new WeakMap<THREE.BufferGeometry, CachedGeometry>();
const ROTATION_CACHE_LIMIT = 128;

/** Exact vertex bounds, shared across translations and duplicate STL vertices. */
export function rotatedGeometryBounds(
  geometry: THREE.BufferGeometry,
  rotation: RotationDeg,
): THREE.Box3 {
  const attribute = geometry.getAttribute('position');
  const version =
    attribute instanceof THREE.InterleavedBufferAttribute
      ? attribute.data.version
      : attribute.version;
  let entry = cache.get(geometry);
  if (!entry || entry.attribute !== attribute || entry.version !== version) {
    const vertices = new Map<string, THREE.Vector3>();
    for (let i = 0; i < attribute.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(attribute, i);
      vertices.set(`${point.x},${point.y},${point.z}`, point);
    }
    entry = { attribute, version, vertices: [...vertices.values()], rotations: new Map() };
    cache.set(geometry, entry);
  }
  const key = `${rotation.x},${rotation.y},${rotation.z}`;
  let box = entry.rotations.get(key);
  if (!box) {
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(rotation.x),
        THREE.MathUtils.degToRad(rotation.y),
        THREE.MathUtils.degToRad(rotation.z),
      ),
    );
    box = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const vertex of entry.vertices)
      box.expandByPoint(point.copy(vertex).applyQuaternion(quaternion));
    if (entry.rotations.size >= ROTATION_CACHE_LIMIT)
      entry.rotations.delete(entry.rotations.keys().next().value!);
  } else {
    entry.rotations.delete(key);
  }
  entry.rotations.set(key, box);
  // Callers translate and expand their bounds; never expose the cached box.
  return box.clone();
}

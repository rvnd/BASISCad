import * as THREE from 'three';

interface EdgeLease {
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  index: THREE.BufferAttribute | null;
  positionVersion: number;
  indexVersion: number;
  geometry: THREE.EdgesGeometry;
  references: number;
}
const edgeCache = new WeakMap<THREE.BufferGeometry, EdgeLease>();

/** Share outlines while instances exist; dispose them when their last owner leaves. */
function retainEdges(source: THREE.BufferGeometry): {
  geometry: THREE.EdgesGeometry;
  release: () => void;
} {
  const positions = source.getAttribute('position'),
    index = source.index;
  const positionVersion =
    positions instanceof THREE.InterleavedBufferAttribute
      ? positions.data.version
      : positions.version;
  const indexVersion = index?.version ?? 0;
  let entry = edgeCache.get(source);
  if (
    !entry ||
    entry.positions !== positions ||
    entry.index !== index ||
    entry.positionVersion !== positionVersion ||
    entry.indexVersion !== indexVersion
  ) {
    entry = {
      positions,
      index,
      positionVersion,
      indexVersion,
      geometry: new THREE.EdgesGeometry(source, 30),
      references: 0,
    };
    edgeCache.set(source, entry);
  }
  entry.references++;
  const retained = entry;
  return {
    geometry: retained.geometry,
    release: () => {
      if (--retained.references === 0) {
        retained.geometry.dispose();
        if (edgeCache.get(source) === retained) edgeCache.delete(source);
      }
    },
  };
}

/**
 * Build the 3D object for one placed piece.
 *
 * The mesh uses the piece's colour; a black outline (EdgesGeometry,
 * threshold 30°) is drawn over it, including around hole rims as far
 * as the geometry's edges allow — the spec requires black outlines on
 * every piece, including hole rims, on screen and in printouts. The
 * shared geometry is NOT cloned and must not be disposed by the caller;
 * the outline geometry is shared with reference counting; materials are owned by the returned group
 * and are disposed by `disposePieceMesh`.
 */

export function createPieceMesh(geometry: THREE.BufferGeometry, colourHex: string): THREE.Group {
  const group = new THREE.Group();

  const material = new THREE.MeshStandardMaterial({ color: colourHex });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'piece-mesh';
  group.add(mesh);

  const outlineLease = retainEdges(geometry);
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
  const outline = new THREE.LineSegments(outlineLease.geometry, outlineMaterial);
  outline.userData.sharedOutline = true;
  outline.userData.releaseOutline = outlineLease.release;
  outline.name = 'piece-outline';
  group.add(outline);

  return group;
}

/** Dispose the outline and materials a `createPieceMesh` group owns. */
export function disposePieceMesh(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.LineSegments) {
      if (object.userData.sharedOutline) {
        object.userData.releaseOutline?.();
        object.userData.releaseOutline = undefined;
      } else object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          entry.dispose();
        }
      } else {
        material.dispose();
      }
    } else if (object instanceof THREE.Mesh) {
      const material = object.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          entry.dispose();
        }
      } else {
        material.dispose();
      }
      // Do not dispose object.geometry — it is shared library geometry.
    }
  });
}

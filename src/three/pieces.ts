import * as THREE from 'three';

/**
 * Build the 3D object for one placed piece.
 *
 * The mesh uses the piece's colour; a black outline (EdgesGeometry,
 * threshold 30°) is drawn over it, including around hole rims as far
 * as the geometry's edges allow — the spec requires black outlines on
 * every piece, including hole rims, on screen and in printouts. The
 * shared geometry is NOT cloned and must not be disposed by the caller;
 * the outline geometry and materials are owned by the returned group
 * and are disposed by `disposePieceMesh`.
 */

export function createPieceMesh(geometry: THREE.BufferGeometry, colourHex: string): THREE.Group {
  const group = new THREE.Group();

  const material = new THREE.MeshStandardMaterial({ color: colourHex });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'piece-mesh';
  group.add(mesh);

  const outlineGeometry = new THREE.EdgesGeometry(geometry, 30);
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
  const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
  outline.name = 'piece-outline';
  group.add(outline);

  return group;
}

/** Dispose the outline and materials a `createPieceMesh` group owns. */
export function disposePieceMesh(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.LineSegments) {
      object.geometry.dispose();
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

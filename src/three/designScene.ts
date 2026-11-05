import * as THREE from 'three';
import type { PlacedPiece } from '../app/design';
import type { LibraryPiece } from '../app/library';
import { getGeometry } from './libraryGeometry';
import { createPieceMesh, disposePieceMesh } from './pieces';

/**
 * Keeps the Three.js scene in sync with the design data in App state.
 *
 * App owns plain data (`PlacedPiece[]`); this module owns the Three.js
 * objects. `sync` is the only way the two meet: it creates a mesh for
 * every placed piece that does not have one yet, moves and rotates the
 * ones that do, shows a red selection box around the selected ones,
 * and removes (and disposes) the meshes of pieces that left the design.
 * Shared library geometry is never disposed here — `disposePieceMesh`
 * owns only the per-piece outline and materials.
 *
 * Picking is here too: `pick` raycasts the placed pieces and returns
 * the placed id of the piece under the pointer, or null. The viewport
 * owns the pointer events and turns a pick into select / drag / deselect.
 */

export interface DesignScene {
  sync(
    placed: readonly PlacedPiece[],
    library: readonly LibraryPiece[],
    selectedIds: readonly string[],
  ): void;
  /** The placed id under the pointer, or null. */
  pick(ndcX: number, ndcY: number, camera: THREE.Camera): string | null;
  /** The centre of a placed piece on the workplane, or null when it is not in the scene. */
  positionOf(placedId: string): { x: number; z: number } | null;
  dispose(): void;
}

/** Red outline box around a selected piece, a little larger than the piece itself. */
function createSelectionBox(geometry: THREE.BufferGeometry): THREE.LineSegments {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) {
    throw new Error('Could not measure the piece geometry.');
  }
  const size = new THREE.Vector3();
  box.getSize(size);
  const centre = new THREE.Vector3();
  box.getCenter(centre);
  const boxGeometry = new THREE.BoxGeometry(size.x + 4, size.y + 4, size.z + 4);
  const edges = new THREE.EdgesGeometry(boxGeometry);
  boxGeometry.dispose();
  const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xd03f43 }));
  lines.position.copy(centre);
  lines.name = 'piece-selection';
  lines.visible = false;
  return lines;
}

export function createDesignScene(scene: THREE.Scene): DesignScene {
  const group = new THREE.Group();
  group.name = 'design';
  scene.add(group);
  const byId = new Map<string, THREE.Group>();
  const raycaster = new THREE.Raycaster();

  return {
    sync(
      placed: readonly PlacedPiece[],
      library: readonly LibraryPiece[],
      selectedIds: readonly string[],
    ): void {
      const libraryById = new Map(library.map((piece) => [piece.id, piece]));
      const seen = new Set<string>();
      for (const placedPiece of placed) {
        seen.add(placedPiece.id);
        const libraryPiece = libraryById.get(placedPiece.libraryId);
        const geometry =
          libraryPiece?.geometryId === undefined || libraryPiece.geometryId === null
            ? undefined
            : getGeometry(libraryPiece.geometryId);
        if (libraryPiece === undefined || geometry === undefined) {
          continue;
        }
        let object = byId.get(placedPiece.id);
        if (object === undefined) {
          object = createPieceMesh(geometry, libraryPiece.colourHex);
          object.userData.placedId = placedPiece.id;
          object.add(createSelectionBox(geometry));
          group.add(object);
          byId.set(placedPiece.id, object);
        }
        object.position.set(placedPiece.position.x, 0, placedPiece.position.z);
        object.rotation.set(
          THREE.MathUtils.degToRad(placedPiece.rotation.x),
          THREE.MathUtils.degToRad(placedPiece.rotation.y),
          THREE.MathUtils.degToRad(placedPiece.rotation.z),
        );
        const selection = object.getObjectByName('piece-selection');
        if (selection !== undefined) {
          selection.visible = selectedIds.includes(placedPiece.id);
        }
      }
      for (const [id, object] of byId) {
        if (!seen.has(id)) {
          group.remove(object);
          disposePieceMesh(object);
          byId.delete(id);
        }
      }
    },

    pick(ndcX: number, ndcY: number, camera: THREE.Camera): string | null {
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hits = raycaster.intersectObjects(group.children, true);
      for (const hit of hits) {
        let current: THREE.Object3D | null = hit.object;
        while (current !== null) {
          const placedId = current.userData.placedId;
          if (typeof placedId === 'string') {
            return placedId;
          }
          current = current.parent;
        }
      }
      return null;
    },

    positionOf(placedId: string): { x: number; z: number } | null {
      const object = byId.get(placedId);
      if (object === undefined) {
        return null;
      }
      return { x: object.position.x, z: object.position.z };
    },

    dispose(): void {
      for (const object of byId.values()) {
        group.remove(object);
        disposePieceMesh(object);
      }
      byId.clear();
      scene.remove(group);
    },
  };
}

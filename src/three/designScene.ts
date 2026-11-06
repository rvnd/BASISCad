import * as THREE from 'three';
import type { PlacedPiece, RotationDeg } from '../app/design';
import type { LibraryPiece } from '../app/library';
import { getGeometry } from './libraryGeometry';
import { createPieceMesh, disposePieceMesh } from './pieces';
import {
  createProtractor,
  createRotationHandles,
  disposeRotationHandles,
  handleAngleDeg,
  hideProtractor,
  rotationHandleRadius,
  setHandleHover,
  showProtractor,
  updateProtractorAngle,
  updateRotationHandles,
} from './rotationHandles';
import type { RotationAxis } from './rotationHandles';

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
 *
 * Rotation handles (Tinkercad-style, Milestone 4 rebuild): three
 * curved-arrow handles around the single selected piece, one per
 * axis, shown only in Rotate mode. Hover and drag share one hit test
 * — a raycast against the handle meshes themselves — so a grab on the
 * red handle can only ever rotate about X. The handles' visibility is
 * re-evaluated both on `sync` and on `setHandlesEnabled`, so entering
 * Rotate mode shows them immediately instead of waiting for the next
 * design change (the old ring code only re-ran on sync, which is why
 * the rings did not appear until the piece was dragged once).
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
  /** A placed piece's stored rotation, or null when it is not in the scene. */
  rotationOf(placedId: string): RotationDeg | null;
  /** The handle a pointer ray grabs (single selection only), or null. */
  handleHit(
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
  ): {
    placedId: string;
    axis: RotationAxis;
    angleDeg: number;
    radialMm: number;
    radiusMm: number;
  } | null;
  /** The pointer's angle and radius on one handle's plane, or null when the ray misses the plane. */
  handleAngle(
    axis: RotationAxis,
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
  ): { angleDeg: number; radialMm: number; radiusMm: number } | null;
  /** Show or hide the rotation handles. They only ever show in Rotate mode. */
  setHandlesEnabled(enabled: boolean): void;
  /** Highlight one handle while the pointer hovers it, or clear the highlight. */
  setHandleHover(axis: RotationAxis | null): void;
  /** Show the protractor for one axis at an angle, or hide it when axis is null. */
  setProtractor(axis: RotationAxis | null, angleDeg: number): void;
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

/**
 * How far a piece must be lifted so that, after its rotation, no
 * part of it sits below the workplane. Geometry is normalised with
 * its base on y = 0, and the group rotates about its base centre —
 * so a 180° flip about X or Z would swing the part underneath the
 * plane without this lift. Rotation about the vertical (Y) axis
 * never needs lifting.
 */
function rotationLift(geometry: THREE.BufferGeometry, rotation: RotationDeg): number {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) {
    return 0;
  }
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(rotation.x),
      THREE.MathUtils.degToRad(rotation.y),
      THREE.MathUtils.degToRad(rotation.z),
    ),
  );
  let minY = Number.POSITIVE_INFINITY;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        minY = Math.min(minY, new THREE.Vector3(x, y, z).applyMatrix4(matrix).y);
      }
    }
  }
  return Math.max(0, -minY);
}

/** Centre of a piece's rotated bounding box, in the piece's local frame. */
function rotatedBoxCentre(geometry: THREE.BufferGeometry, rotation: RotationDeg): THREE.Vector3 {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) {
    return new THREE.Vector3();
  }
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(rotation.x),
      THREE.MathUtils.degToRad(rotation.y),
      THREE.MathUtils.degToRad(rotation.z),
    ),
  );
  const min = new THREE.Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  const max = new THREE.Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const corner = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
        min.min(corner);
        max.max(corner);
      }
    }
  }
  return min.add(max).multiplyScalar(0.5);
}

/** The axis a raycast hit belongs to, from the handle sub-group it is in. */
function axisOfHit(object: THREE.Object3D | null): RotationAxis | null {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    const axis = current.userData.handleAxis as RotationAxis | undefined;
    if (axis === 'x' || axis === 'y' || axis === 'z') {
      return axis;
    }
    current = current.parent;
  }
  return null;
}

export function createDesignScene(scene: THREE.Scene): DesignScene {
  const group = new THREE.Group();
  group.name = 'design';
  scene.add(group);
  const byId = new Map<string, THREE.Group>();
  const raycaster = new THREE.Raycaster();
  // Rotation handles, shown around the single selected piece. They live
  // directly on the scene (not in the design group, whose children
  // are one group per placed piece) — the design group has no
  // transform, so the handles sit at the same world position either way.
  const handles = createRotationHandles();
  scene.add(handles);
  const protractor = createProtractor();
  scene.add(protractor);
  let handleCentre: THREE.Vector3 | null = null;
  // Visual handle radius is intentionally larger than the protractor
  // radius. Keeping them separate preserves the existing drag snap feel.
  let handleRadius = 0;
  let protractorRadius = 0;
  let handlePlacedId: string | null = null;
  // Handles only show in Rotate mode: in Move mode a handle grab would
  // silently rotate a piece the user was trying to move.
  let handlesEnabled = false;
  // The last synced design, so entering Rotate mode can show the
  // handles immediately without waiting for a design change.
  let lastPlaced: readonly PlacedPiece[] = [];
  let lastLibrary: readonly LibraryPiece[] = [];
  let lastSelectedIds: readonly string[] = [];

  /**
   * Recompute where the handles sit from the last synced design.
   * Runs on every sync and whenever Rotate mode is entered or left.
   */
  const updateHandles = (): void => {
    handleCentre = null;
    handleRadius = 0;
    protractorRadius = 0;
    handlePlacedId = null;
    const libraryById = new Map(lastLibrary.map((piece) => [piece.id, piece]));
    if (handlesEnabled && lastSelectedIds.length === 1) {
      const selectedId = lastSelectedIds[0];
      const selectedPlaced = lastPlaced.find((piece) => piece.id === selectedId);
      const selectedObject = selectedId === undefined ? undefined : byId.get(selectedId);
      const selectedLibrary =
        selectedPlaced === undefined ? undefined : libraryById.get(selectedPlaced.libraryId);
      const selectedGeometry =
        selectedLibrary?.geometryId === undefined || selectedLibrary.geometryId === null
          ? undefined
          : getGeometry(selectedLibrary.geometryId);
      if (
        selectedPlaced !== undefined &&
        selectedObject !== undefined &&
        selectedGeometry !== undefined
      ) {
        const centre = rotatedBoxCentre(selectedGeometry, selectedPlaced.rotation);
        centre.x += selectedPlaced.position.x;
        centre.y += selectedObject.position.y;
        centre.z += selectedPlaced.position.z;
        selectedGeometry.computeBoundingSphere();
        const sphere = selectedGeometry.boundingSphere;
        handleCentre = centre;
        protractorRadius = (sphere?.radius ?? 0) + 14;
        handleRadius = rotationHandleRadius(sphere?.radius ?? 0);
        handlePlacedId = selectedId ?? null;
      }
    }
    updateRotationHandles(handles, handleCentre, handleRadius);
    if (handleCentre === null) {
      hideProtractor(protractor);
    }
  };

  /** The pointer's angle and radius on one handle's plane, in world space. */
  const angleOnPlane = (
    axis: RotationAxis,
    ray: THREE.Ray,
  ): { angleDeg: number; radialMm: number } | null => {
    if (handleCentre === null) {
      return null;
    }
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : axis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1),
      handleCentre,
    );
    const point = new THREE.Vector3();
    if (ray.intersectPlane(plane, point) === null) {
      return null;
    }
    return {
      angleDeg: handleAngleDeg(axis, handleCentre, point),
      radialMm: point.distanceTo(handleCentre),
    };
  };

  return {
    sync(
      placed: readonly PlacedPiece[],
      library: readonly LibraryPiece[],
      selectedIds: readonly string[],
    ): void {
      lastPlaced = placed;
      lastLibrary = library;
      lastSelectedIds = selectedIds;
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
        object.position.set(
          placedPiece.position.x,
          placedPiece.position.y + rotationLift(geometry, placedPiece.rotation),
          placedPiece.position.z,
        );
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
      updateHandles();
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

    rotationOf(placedId: string): RotationDeg | null {
      const object = byId.get(placedId);
      if (object === undefined) {
        return null;
      }
      return {
        x: THREE.MathUtils.radToDeg(object.rotation.x),
        y: THREE.MathUtils.radToDeg(object.rotation.y),
        z: THREE.MathUtils.radToDeg(object.rotation.z),
      };
    },

    handleHit(
      ndcX: number,
      ndcY: number,
      camera: THREE.Camera,
    ): {
      placedId: string;
      axis: RotationAxis;
      angleDeg: number;
      radialMm: number;
      radiusMm: number;
    } | null {
      if (!handlesEnabled || handleCentre === null || handlePlacedId === null) {
        return null;
      }
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hits = raycaster.intersectObjects(handles.children, true);
      for (const hit of hits) {
        const axis = axisOfHit(hit.object);
        if (axis === null) {
          continue;
        }
        const onPlane = angleOnPlane(axis, raycaster.ray);
        if (onPlane === null) {
          continue;
        }
        return {
          placedId: handlePlacedId,
          axis,
          angleDeg: onPlane.angleDeg,
          radialMm: onPlane.radialMm,
          radiusMm: protractorRadius,
        };
      }
      return null;
    },

    handleAngle(
      axis: RotationAxis,
      ndcX: number,
      ndcY: number,
      camera: THREE.Camera,
    ): { angleDeg: number; radialMm: number; radiusMm: number } | null {
      if (!handlesEnabled || handleCentre === null) {
        return null;
      }
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const onPlane = angleOnPlane(axis, raycaster.ray);
      if (onPlane === null) {
        return null;
      }
      return { ...onPlane, radiusMm: protractorRadius };
    },

    setHandlesEnabled(enabled: boolean): void {
      handlesEnabled = enabled;
      if (!enabled) {
        setHandleHover(handles, null);
      }
      // Re-evaluate immediately from the last sync: entering Rotate
      // mode must show the handles at once, not on the next drag.
      updateHandles();
    },

    setHandleHover(axis: RotationAxis | null): void {
      setHandleHover(handles, axis);
    },

    setProtractor(axis: RotationAxis | null, angleDeg: number): void {
      if (axis === null || handleCentre === null || protractorRadius <= 0) {
        hideProtractor(protractor);
        return;
      }
      if (!protractor.visible) {
        showProtractor(protractor, axis, handleCentre, protractorRadius, angleDeg);
        return;
      }
      updateProtractorAngle(protractor, axis, angleDeg);
    },

    dispose(): void {
      for (const object of byId.values()) {
        group.remove(object);
        disposePieceMesh(object);
      }
      byId.clear();
      disposeRotationHandles(handles);
      scene.remove(handles);
      scene.remove(protractor);
      scene.remove(group);
    },
  };
}

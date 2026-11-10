import * as THREE from 'three';
import type { PlacedPiece, PositionMm } from '../app/design';
import type { LibraryPiece } from '../app/library';
import type { LabelMode } from '../app/labels';
import type { BlueprintLabel } from './blueprintLabels';
import { projectBlueprintLabels } from './blueprintLabels';
import { assemblyBounds } from './assemblyEdits';
import { geometryLookup } from './designConstraints';
import { pieceMatrix } from './pieceTransforms';
import { createPieceMesh, disposePieceMesh } from './pieces';

import type { PrintView } from '../app/printViews';
export { PRINT_VIEWS } from '../app/printViews';
export type { PrintView } from '../app/printViews';
export interface PrintSnapshot {
  image: string;
  width: number;
  height: number;
  size: PositionMm;
  labels: readonly BlueprintLabel[];
}
export function printCamera(
  bounds: THREE.Box3,
  width: number,
  height: number,
): THREE.OrthographicCamera {
  const scale = Math.max(1, bounds.getSize(new THREE.Vector3()).length());
  return new THREE.OrthographicCamera(
    (-scale * width) / height,
    (scale * width) / height,
    scale,
    -scale,
    0.1,
    10000,
  );
}
export function framePrintCamera(
  camera: THREE.OrthographicCamera,
  bounds: THREE.Box3,
  view: PrintView,
  width: number,
  height: number,
): void {
  const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const direction =
    view === 'top'
      ? new THREE.Vector3(0, 1, 0)
      : view === 'front'
        ? new THREE.Vector3(0, 0, 1)
        : view === 'side'
          ? new THREE.Vector3(1, 0, 0)
          : new THREE.Vector3(1, 1, 1).normalize();
  camera.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0);
  camera.position
    .copy(center)
    .addScaledVector(direction, Math.max(500, bounds.getSize(new THREE.Vector3()).length() * 2));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const projected = new THREE.Box3();
  if (!bounds.isEmpty())
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z])
          projected.expandByPoint(
            new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse),
          );
  const size = projected.isEmpty()
    ? new THREE.Vector3(50, 50, 50)
    : projected.getSize(new THREE.Vector3());
  const halfHeight = Math.max(5, size.y / 2, size.x / 2 / (width / height)) * 1.45;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.right = (halfHeight * width) / height;
  camera.left = -camera.right;
  camera.updateProjectionMatrix();
}
/** Render an isolated print scene, with black outlines and the saved annotation mode. */
export function renderPrintSnapshot(
  placed: readonly PlacedPiece[],
  library: ReadonlyMap<string, LibraryPiece>,
  view: PrintView,
  mode: LabelMode,
): PrintSnapshot {
  const width = 700,
    height = 770,
    bounds = assemblyBounds(placed, new Set(placed.map((piece) => piece.id)), library),
    geometry = geometryLookup(library);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(2);
  renderer.setSize(width, height);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#fff');
  scene.add(new THREE.AmbientLight('#fff', 1.4));
  const light = new THREE.DirectionalLight('#fff', 1.2);
  light.position.set(400, 800, 500);
  scene.add(light);
  const camera = printCamera(bounds, width, height),
    objects: THREE.Group[] = [];
  try {
    framePrintCamera(camera, bounds, view, width, height);
    for (const piece of placed) {
      const mesh = geometry(piece);
      if (!mesh)
        throw new Error('Some pieces are still loading. Try the print preview again in a moment.');
      const object = createPieceMesh(
        mesh,
        piece.fastener ? '#b6bbc1' : (library.get(piece.libraryId)?.colourHex ?? '#eee'),
      );
      object.applyMatrix4(pieceMatrix(piece, mesh));
      scene.add(object);
      objects.push(object);
    }
    renderer.render(scene, camera);
    const size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
    return {
      image: renderer.domElement.toDataURL('image/png'),
      width,
      height,
      size: { x: size.x, y: size.y, z: size.z },
      labels: projectBlueprintLabels(placed, library, camera, width, height, mode),
    };
  } finally {
    objects.forEach(disposePieceMesh);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

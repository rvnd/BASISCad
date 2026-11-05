import * as THREE from 'three';

/**
 * Pointer math for dragging pieces: turn a pointer position (in
 * normalised device coordinates, -1..1) into the point where the
 * camera ray meets the workplane (the y = 0 plane). Pure Three.js
 * maths — no renderer, no DOM — so it is unit-testable.
 */

/** The workplane as a mathematical plane: y = 0, facing up. */
const WORKPLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * Where the ray through (`ndcX`, `ndcY`) meets the workplane, or null
 * when the ray never meets it (e.g. it points along or away from the
 * plane — the camera can never go below the workplane, so this is
 * only a safety net).
 */
export function pointerToWorkplane(
  ndcX: number,
  ndcY: number,
  camera: THREE.Camera,
): { x: number; z: number } | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const point = raycaster.ray.intersectPlane(WORKPLANE, new THREE.Vector3());
  if (point === null) {
    return null;
  }
  return { x: point.x, z: point.z };
}

/** Normalised device coordinates of a pointer event over the canvas. */
export function eventToNdc(event: PointerEvent, canvas: HTMLElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

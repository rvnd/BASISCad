import * as THREE from 'three';
import type { PositionMm } from '../app/design';
import type { RotationAxis } from './rotationHandles';

/** CSS pixels per millimetre along a world axis at the gesture's starting point. */
export function tabletAxisProjection(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  position: PositionMm,
  axis: RotationAxis,
): { x: number; y: number } {
  const point = new THREE.Vector3(position.x, position.y, position.z);
  const start = point.clone().project(camera);
  const end = point.clone();
  end[axis] += 20;
  end.project(camera);
  const projection = { x: ((end.x - start.x) * width) / 40, y: ((start.y - end.y) * height) / 40 };
  const pixelsPerMm =
    height /
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.distanceTo(point));
  // An axis pointing at the camera has no useful screen direction. In that
  // view, dragging up increases the chosen coordinate at the current zoom.
  return Math.hypot(projection.x, projection.y) < pixelsPerMm * 0.1
    ? { x: 0, y: -pixelsPerMm }
    : projection;
}

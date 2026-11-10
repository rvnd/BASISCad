import * as THREE from 'three';
import type { PlacedPiece, RotationDeg } from '../app/design';
import { rotatedGeometryBounds } from './geometryBounds';

export function quaternionRotation(quaternion: THREE.Quaternion): RotationDeg {
  const angles = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  return {
    x: THREE.MathUtils.radToDeg(angles.x),
    y: THREE.MathUtils.radToDeg(angles.y),
    z: THREE.MathUtils.radToDeg(angles.z),
  };
}

export function pieceQuaternion(rotation: RotationDeg): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(rotation.x),
      THREE.MathUtils.degToRad(rotation.y),
      THREE.MathUtils.degToRad(rotation.z),
    ),
  );
}

/** Match the rendered piece's base height after rotating its actual vertices. */
export function rotationLift(geometry: THREE.BufferGeometry, rotation: RotationDeg): number {
  if (rotation.x === 0 && rotation.z === 0) return 0;
  return Math.max(0, -rotatedGeometryBounds(geometry, rotation).min.y);
}

export function pieceMatrix(piece: PlacedPiece, geometry: THREE.BufferGeometry): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(
      piece.position.x,
      piece.position.y + rotationLift(geometry, piece.rotation),
      piece.position.z,
    ),
    pieceQuaternion(piece.rotation),
    new THREE.Vector3(1, 1, 1),
  );
}

/** Apply a rigid world transform and convert its origin back to the stored base-height convention. */
export function transformPiece(
  piece: PlacedPiece,
  geometry: THREE.BufferGeometry,
  transform: THREE.Matrix4,
): PlacedPiece {
  const result = transform.clone().multiply(pieceMatrix(piece, geometry));
  const origin = new THREE.Vector3(),
    quaternion = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  result.decompose(origin, quaternion, scale);
  const rotation = quaternionRotation(quaternion);
  return {
    ...piece,
    rotation,
    position: { x: origin.x, y: origin.y - rotationLift(geometry, rotation), z: origin.z },
  };
}

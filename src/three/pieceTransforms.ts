import * as THREE from 'three';
import type { PlacedPiece, RotationDeg } from '../app/design';

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
  const positions = geometry.getAttribute('position');
  const quaternion = pieceQuaternion(rotation);
  const point = new THREE.Vector3();
  let minY = 0;
  for (let i = 0; i < positions.count; i += 1) {
    point.fromBufferAttribute(positions, i).applyQuaternion(quaternion);
    minY = Math.min(minY, point.y);
  }
  return -minY;
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

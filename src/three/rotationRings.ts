import * as THREE from 'three';

/**
 * Draggable rotation rings (Milestone 4).
 *
 * One ring per axis sits around the selected piece, coloured like the
 * workplane axes (X red, Y green, Z blue). A ring is a torus whose
 * hole the axis passes through: the X ring lies in the YZ plane, the
 * Y ring in the XZ plane, the Z ring in the XY plane.
 *
 * Picking is maths, not mesh raycasting: a pointer ray is intersected
 * with each ring's plane, and a hit counts when the intersection sits
 * close to the ring's radius. That keeps thin rings grabbable (a
 * 14 mm tolerance band) without invisible pick meshes.
 *
 * Angle signs: rotating a piece about an axis by θ moves a point on
 * that axis's ring by the same θ degrees — each ring's angle is
 * measured in its own plane with the handedness that matches
 * three.js's right-handed rotation about that axis (verified against
 * a real three.js rotation in the tests). The viewport therefore
 * applies the pointer's angle change directly as the rotation change.
 */

export type RotationAxis = 'x' | 'y' | 'z';

export const RING_AXES: readonly RotationAxis[] = ['x', 'y', 'z'];

/** Axis colours, matching the workplane axes. */
export const RING_AXIS_COLOURS: Record<RotationAxis, number> = {
  x: 0xd03f43,
  y: 0x2b8a3e,
  z: 0x1971c2,
};

export const RING_ANGLE_SIGNS: Record<RotationAxis, 1 | -1> = { x: 1, y: 1, z: 1 };

/** How far from a ring's radius, in mm, a pointer still counts as grabbing it. */
export const RING_HIT_TOLERANCE_MM = 14;

/** Unit vector along an axis. */
export function axisNormal(axis: RotationAxis): THREE.Vector3 {
  if (axis === 'x') {
    return new THREE.Vector3(1, 0, 0);
  }
  if (axis === 'y') {
    return new THREE.Vector3(0, 1, 0);
  }
  return new THREE.Vector3(0, 0, 1);
}

/**
 * The angle, in degrees, of a point around an axis through a centre.
 * X is measured in the YZ plane, Y in the XZ plane, Z in the XY plane.
 */
export function ringAngleDeg(
  axis: RotationAxis,
  centre: THREE.Vector3,
  point: THREE.Vector3,
): number {
  if (axis === 'x') {
    return THREE.MathUtils.radToDeg(Math.atan2(point.z - centre.z, point.y - centre.y));
  }
  if (axis === 'y') {
    return THREE.MathUtils.radToDeg(Math.atan2(point.x - centre.x, point.z - centre.z));
  }
  return THREE.MathUtils.radToDeg(Math.atan2(point.y - centre.y, point.x - centre.x));
}

/** Smallest signed step from one angle to another, in (-180, 180]. */
export function unwrapAngleDelta(fromDeg: number, toDeg: number): number {
  return ((((toDeg - fromDeg + 540) % 360) + 360) % 360) - 180;
}

export interface RingHit {
  axis: RotationAxis;
  /** The pointer's angle on the ring, in degrees. */
  angleDeg: number;
}

/**
 * The ring a ray grabs, if any: the ring whose plane the ray meets
 * within the tolerance band of its radius. When the ray meets more
 * than one ring, the closest to its radius wins.
 */
export function ringHit(centre: THREE.Vector3, radius: number, ray: THREE.Ray): RingHit | null {
  let best: RingHit | null = null;
  let bestError = Number.POSITIVE_INFINITY;
  const hit = new THREE.Vector3();
  for (const axis of RING_AXES) {
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axisNormal(axis), centre);
    if (ray.intersectPlane(plane, hit) === null) {
      continue;
    }
    const radial = hit.distanceTo(centre);
    const error = Math.abs(radial - radius);
    if (error <= RING_HIT_TOLERANCE_MM && error < bestError) {
      bestError = error;
      best = { axis, angleDeg: ringAngleDeg(axis, centre, hit) };
    }
  }
  return best;
}

/**
 * The three ring meshes, built once and moved/scaled by
 * `updateRotationRings`. Each torus has radius 1 and is scaled to the
 * ring radius, so its tube stays proportional. The group is hidden
 * when there is no single selected piece.
 */
export function createRotationRings(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rotation-rings';
  group.visible = false;
  for (const axis of RING_AXES) {
    const geometry = new THREE.TorusGeometry(1, 0.025, 12, 64);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: RING_AXIS_COLOURS[axis] }),
    );
    mesh.name = `rotation-ring-${axis}`;
    if (axis === 'x') {
      mesh.rotation.y = Math.PI / 2;
    } else if (axis === 'y') {
      mesh.rotation.x = Math.PI / 2;
    }
    group.add(mesh);
  }
  return group;
}

/** Place the rings around a piece's centre at a radius, or hide them. */
export function updateRotationRings(
  group: THREE.Group,
  centre: THREE.Vector3 | null,
  radius: number,
): void {
  if (centre === null || radius <= 0) {
    group.visible = false;
    return;
  }
  group.visible = true;
  group.position.copy(centre);
  group.scale.setScalar(radius);
}

/** Dispose the rings' geometries and materials. */
export function disposeRotationRings(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          entry.dispose();
        }
      } else {
        material.dispose();
      }
    }
  });
}

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

/** The same axis colours as CSS hex strings, for the panel. */
export const RING_AXIS_HEX: Record<RotationAxis, string> = {
  x: '#D03F43',
  y: '#2B8A3E',
  z: '#1971C2',
};

/** Plain-language colour names, for hover hints and tooltips. */
export const RING_AXIS_COLOUR_NAMES: Record<RotationAxis, string> = {
  x: 'red',
  y: 'green',
  z: 'blue',
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
 * Where a ring's label and grab knob sit on it, as a unit direction
 * from the ring centre (multiply by the ring radius for a position).
 *
 * The rings cross each other, so the three points are chosen so no
 * two coincide: each sits 45° around its own ring, in the
 * front-top-right octant — X at the top-front of its YZ ring, Y at the
 * front-right of its XZ ring, Z at the top-right of its XY ring.
 * Each point lies on its own ring's plane and off the other two rings'
 * planes, so the labels never overlap each other.
 */
export function ringLabelOffset(axis: RotationAxis): THREE.Vector3 {
  const d = Math.SQRT1_2;
  if (axis === 'x') {
    return new THREE.Vector3(0, d, d);
  }
  if (axis === 'y') {
    return new THREE.Vector3(d, 0, d);
  }
  return new THREE.Vector3(d, d, 0);
}

/** How far out from the ring, in ring radii, a label sprite sits. */
const LABEL_RADIUS = 1.22;

/** Knob radius and label size, in ring radii (the group is scaled by the ring radius). */
const KNOB_RADIUS = 0.085;
const LABEL_SIZE = 0.42;

/** A label sprite: the axis letter on a white disc with a coloured rim. */
function createAxisLabelSprite(axis: RotationAxis): THREE.Sprite {
  // Vitest runs in node, where there is no document: build the sprite
  // with a plain material there (tests check its name and position,
  // not its pixels); in the browser the canvas letter is drawn.
  if (typeof document === 'undefined') {
    const material = new THREE.SpriteMaterial({ color: 0xffffff });
    const sprite = new THREE.Sprite(material);
    sprite.name = `rotation-ring-label-${axis}`;
    sprite.scale.setScalar(LABEL_SIZE);
    sprite.position.copy(ringLabelOffset(axis)).multiplyScalar(LABEL_RADIUS);
    return sprite;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Could not draw the rotation ring label.');
  }
  const hex = RING_AXIS_HEX[axis];
  context.beginPath();
  context.arc(64, 64, 56, 0, Math.PI * 2);
  context.fillStyle = '#ffffff';
  context.fill();
  context.lineWidth = 10;
  context.strokeStyle = hex;
  context.stroke();
  context.fillStyle = hex;
  context.font = 'bold 72px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(axis.toUpperCase(), 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: true });
  const sprite = new THREE.Sprite(material);
  sprite.name = `rotation-ring-label-${axis}`;
  sprite.scale.setScalar(LABEL_SIZE);
  sprite.position.copy(ringLabelOffset(axis)).multiplyScalar(LABEL_RADIUS);
  return sprite;
}

interface RingParts {
  ring: THREE.Mesh;
  knob: THREE.Mesh;
  label: THREE.Sprite;
  baseColour: THREE.Color;
  baseKnobScale: number;
  baseLabelScale: number;
}

/** Lighten a colour towards white, for the hovered ring. */
function lightenColour(colour: THREE.Color, amount: number): THREE.Color {
  return colour.clone().lerp(new THREE.Color(0xffffff), amount);
}

/**
 * The three ring meshes, built once and moved/scaled by
 * `updateRotationRings`. Each torus has radius 1 and is scaled to the
 * ring radius, so its tube stays proportional. Every ring also gets a
 * visible grab knob (a sphere in the ring's colour) and a letter
 * label sprite at the same point on the ring, so there is an obvious
 * place to grab and the axis is named in the 3D view. The group is
 * hidden when there is no single selected piece.
 */
export function createRotationRings(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rotation-rings';
  group.visible = false;
  const parts: Partial<Record<RotationAxis, RingParts>> = {};
  for (const axis of RING_AXES) {
    const baseColour = new THREE.Color(RING_AXIS_COLOURS[axis]);
    const geometry = new THREE.TorusGeometry(1, 0.025, 12, 64);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: baseColour }));
    mesh.name = `rotation-ring-${axis}`;
    if (axis === 'x') {
      mesh.rotation.y = Math.PI / 2;
    } else if (axis === 'y') {
      mesh.rotation.x = Math.PI / 2;
    }
    group.add(mesh);
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(KNOB_RADIUS, 20, 14),
      new THREE.MeshBasicMaterial({ color: baseColour }),
    );
    knob.name = `rotation-ring-knob-${axis}`;
    knob.position.copy(ringLabelOffset(axis));
    group.add(knob);
    const label = createAxisLabelSprite(axis);
    group.add(label);
    parts[axis] = {
      ring: mesh,
      knob,
      label,
      baseColour,
      baseKnobScale: 1,
      baseLabelScale: LABEL_SIZE,
    };
  }
  group.userData.ringParts = parts;
  return group;
}

/** The per-axis meshes a ring group was built with, if any. */
function ringPartsOf(group: THREE.Group): Partial<Record<RotationAxis, RingParts>> {
  const parts = group.userData.ringParts as Partial<Record<RotationAxis, RingParts>> | undefined;
  return parts ?? {};
}

/**
 * Highlight one ring (and its knob and label) while the pointer hovers
 * it, and restore the others. Pass null to clear the highlight.
 * The hovered ring brightens towards white, its knob grows, and its
 * label grows — the other two rings are left exactly as they were.
 */
export function setRingHover(group: THREE.Group, axis: RotationAxis | null): void {
  for (const entry of RING_AXES) {
    const parts = ringPartsOf(group)[entry];
    if (parts === undefined) {
      continue;
    }
    const hovered = entry === axis;
    const ringMaterial = parts.ring.material;
    if (ringMaterial instanceof THREE.MeshBasicMaterial) {
      ringMaterial.color.copy(hovered ? lightenColour(parts.baseColour, 0.45) : parts.baseColour);
    }
    const knobMaterial = parts.knob.material;
    if (knobMaterial instanceof THREE.MeshBasicMaterial) {
      knobMaterial.color.copy(hovered ? lightenColour(parts.baseColour, 0.45) : parts.baseColour);
    }
    parts.knob.scale.setScalar(hovered ? 1.5 : parts.baseKnobScale);
    parts.label.scale.setScalar(hovered ? parts.baseLabelScale * 1.3 : parts.baseLabelScale);
  }
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
    } else if (object instanceof THREE.Sprite) {
      const material = object.material;
      if (material.map !== null) {
        material.map.dispose();
      }
      material.dispose();
    }
  });
}

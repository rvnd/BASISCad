import * as THREE from 'three';

/**
 * Tinkercad-style rotation handles (Milestone 4 rebuild).
 *
 * This replaces the full-circle rings from PR #34, which Aravind found
 * unusable on the live site: the rings did not appear at all on
 * entering Rotate mode, the knob-to-axis mapping was swapped, and
 * hovering did nothing. The new UI copies Tinkercad:
 *
 * - Three small curved-arrow handles around the selected piece, one
 *   per axis, colour-coded like the workplane axes (X red, Y green,
 *   Z blue). Each handle is a short arc (about 80°) with a cone
 *   arrowhead at one end and a sphere knob at the other, sitting at
 *   the piece's edge — not a full circle encircling the piece.
 * - While a handle is dragged, a protractor circle appears in that
 *   handle's plane with tick marks and a live angle readout.
 * - Snap rules, also Tinkercad's: dragging with the pointer inside
 *   the protractor circle snaps to 22.5° steps, outside it rotates
 *   freely in 1° steps, and holding Shift snaps to 45° steps.
 *   Sources: Tinkercad Quickstart Guide
 *   (https://cplmakerlab.github.io/guide/tinkercad-quickstart-guide/)
 *   and BMCC Makerspace 3D Workshop
 *   (https://openlab.bmcc.cuny.edu/makerspace/3d-workshop/).
 *
 * Picking is mesh-based, not plane maths: a pointer ray is cast
 * against the handle meshes themselves, and every mesh of a handle
 * carries its axis in `userData.handleAxis`. Grabbing the red handle
 * can therefore only ever rotate about X — hover and drag share this
 * one hit test, so they can never disagree the way the ring code did.
 *
 * Angle signs: rotating a piece about an axis by θ moves a point on
 * that axis's handle by the same θ degrees — each handle's angle is
 * measured in its own plane with the handedness that matches
 * three.js's right-handed rotation about that axis (verified against
 * a real three.js rotation in the tests).
 */

export type RotationAxis = 'x' | 'y' | 'z';

export const HANDLE_AXES: readonly RotationAxis[] = ['x', 'y', 'z'];

/** Axis colours, matching the workplane axes. */
export const HANDLE_AXIS_COLOURS: Record<RotationAxis, number> = {
  x: 0xd03f43,
  y: 0x2b8a3e,
  z: 0x1971c2,
};

/** The same axis colours as CSS hex strings, for the panel. */
export const HANDLE_AXIS_HEX: Record<RotationAxis, string> = {
  x: '#D03F43',
  y: '#2B8A3E',
  z: '#1971C2',
};

/** Plain-language colour names, for hover hints and tooltips. */
export const HANDLE_AXIS_COLOUR_NAMES: Record<RotationAxis, string> = {
  x: 'red',
  y: 'green',
  z: 'blue',
};

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
export function handleAngleDeg(
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

/**
 * Tinkercad's drag snap rule for a rotation-handle drag, applied to
 * the total change since the drag started. Holding Shift snaps to
 * 45°; with the pointer inside the protractor circle (at or within
 * its radius) the change snaps to 22.5°; outside the circle it moves
 * freely in 1° steps. A zero or negative protractor radius means
 * "outside", so the drag is free in 1° steps.
 */
export function snapDragDeltaDeg(
  rawDeltaDeg: number,
  pointerRadialMm: number,
  protractorRadiusMm: number,
  shiftKey: boolean,
): number {
  if (shiftKey) {
    return Math.round(rawDeltaDeg / 45) * 45;
  }
  if (protractorRadiusMm > 0 && pointerRadialMm <= protractorRadiusMm) {
    return Math.round(rawDeltaDeg / 22.5) * 22.5;
  }
  return Math.round(rawDeltaDeg);
}

/**
 * Where each handle's arc sits, as start/end angles in that axis's
 * own angle measure (see `handleAngleDeg`). The three arcs are
 * chosen so no two handles cross or touch: X sits top-front in its
 * YZ plane, Y sits front-right in its XZ plane, Z sits top-right in
 * its XY plane. Each arc spans 80°.
 */
export const HANDLE_ARC_DEG: Record<RotationAxis, { start: number; end: number }> = {
  x: { start: 30, end: 110 },
  y: { start: 20, end: 100 },
  z: { start: 20, end: 100 },
};

/**
 * A point on a handle's arc, in unit space (multiply by the handle
 * radius for a world position). The point lies on its own axis's
 * plane: x is 0 for the X handle, y is 0 for Y, z is 0 for Z.
 */
export function handlePoint(axis: RotationAxis, angleDeg: number): THREE.Vector3 {
  const a = THREE.MathUtils.degToRad(angleDeg);
  if (axis === 'x') {
    return new THREE.Vector3(0, Math.cos(a), Math.sin(a));
  }
  if (axis === 'y') {
    return new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  }
  return new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
}

/**
 * The direction of travel along a handle's arc at an angle, in unit
 * space: the derivative of `handlePoint`, normalised. The arrowhead
 * at the arc's end points along this.
 */
export function handleTangent(axis: RotationAxis, angleDeg: number): THREE.Vector3 {
  const a = THREE.MathUtils.degToRad(angleDeg);
  if (axis === 'x') {
    return new THREE.Vector3(0, -Math.sin(a), Math.cos(a));
  }
  if (axis === 'y') {
    return new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
  }
  return new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
}

/** How far out from the handle, in handle radii, a label sprite sits. */
const LABEL_RADIUS = 1.28;

/** Arc tube, knob, and arrowhead sizes, in handle radii (the group is scaled by the handle radius). */
const ARC_TUBE = 0.035;
const KNOB_RADIUS = 0.1;
const ARROW_RADIUS = 0.075;
const ARROW_HEIGHT = 0.2;
const LABEL_SIZE = 0.42;

/** A label sprite: the axis letter on a white disc with a coloured rim. */
function createAxisLabelSprite(axis: RotationAxis): THREE.Sprite {
  // Vitest runs in node, where there is no document: build the sprite
  // with a plain material there (tests check its name and position,
  // not its pixels); in the browser the canvas letter is drawn.
  const mid = (HANDLE_ARC_DEG[axis].start + HANDLE_ARC_DEG[axis].end) / 2;
  if (typeof document === 'undefined') {
    const material = new THREE.SpriteMaterial({ color: 0xffffff });
    const sprite = new THREE.Sprite(material);
    sprite.name = `rotation-handle-label-${axis}`;
    sprite.scale.setScalar(LABEL_SIZE);
    sprite.position.copy(handlePoint(axis, mid)).multiplyScalar(LABEL_RADIUS);
    return sprite;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Could not draw the rotation handle label.');
  }
  const hex = HANDLE_AXIS_HEX[axis];
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
  sprite.name = `rotation-handle-label-${axis}`;
  sprite.scale.setScalar(LABEL_SIZE);
  sprite.position.copy(handlePoint(axis, mid)).multiplyScalar(LABEL_RADIUS);
  return sprite;
}

/** A curve following one handle's arc, in unit space, for the tube geometry. */
class HandleArcCurve extends THREE.Curve<THREE.Vector3> {
  private readonly axis: RotationAxis;

  constructor(axis: RotationAxis) {
    super();
    this.axis = axis;
  }

  override getPoint(t: number): THREE.Vector3 {
    const { start, end } = HANDLE_ARC_DEG[this.axis];
    return handlePoint(this.axis, start + t * (end - start));
  }
}

interface HandleParts {
  arc: THREE.Mesh;
  arrowhead: THREE.Mesh;
  knob: THREE.Mesh;
  label: THREE.Sprite;
  baseColour: THREE.Color;
  baseKnobScale: number;
  baseLabelScale: number;
}

/** Lighten a colour towards white, for the hovered handle. */
function lightenColour(colour: THREE.Color, amount: number): THREE.Color {
  return colour.clone().lerp(new THREE.Color(0xffffff), amount);
}

/**
 * The three curved-arrow handles, built once and moved/scaled by
 * `updateRotationHandles`. The group is scaled by the handle radius,
 * so every part is built in unit space. Each axis gets its own
 * sub-group carrying `userData.handleAxis`, so a raycast hit on any
 * part of a handle — arc, arrowhead, knob, or label — identifies
 * that handle's axis and nothing else. The group is hidden when
 * there is no single selected piece in Rotate mode.
 */
export function createRotationHandles(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rotation-handles';
  group.visible = false;
  const parts: Partial<Record<RotationAxis, HandleParts>> = {};
  for (const axis of HANDLE_AXES) {
    const baseColour = new THREE.Color(HANDLE_AXIS_COLOURS[axis]);
    const material = (): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({ color: baseColour.clone() });
    const sub = new THREE.Group();
    sub.name = `rotation-handle-${axis}`;
    sub.userData.handleAxis = axis;

    const { start, end } = HANDLE_ARC_DEG[axis];
    const arc = new THREE.Mesh(
      new THREE.TubeGeometry(new HandleArcCurve(axis), 32, ARC_TUBE, 10),
      material(),
    );
    arc.name = `rotation-handle-arc-${axis}`;
    arc.userData.handleAxis = axis;
    sub.add(arc);

    const arrowhead = new THREE.Mesh(
      new THREE.ConeGeometry(ARROW_RADIUS, ARROW_HEIGHT, 16),
      material(),
    );
    arrowhead.name = `rotation-handle-arrow-${axis}`;
    arrowhead.userData.handleAxis = axis;
    arrowhead.position.copy(handlePoint(axis, end));
    arrowhead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), handleTangent(axis, end));
    sub.add(arrowhead);

    const knob = new THREE.Mesh(new THREE.SphereGeometry(KNOB_RADIUS, 20, 14), material());
    knob.name = `rotation-handle-knob-${axis}`;
    knob.userData.handleAxis = axis;
    knob.position.copy(handlePoint(axis, start));
    sub.add(knob);

    const label = createAxisLabelSprite(axis);
    label.userData.handleAxis = axis;
    sub.add(label);

    group.add(sub);
    parts[axis] = {
      arc,
      arrowhead,
      knob,
      label,
      baseColour,
      baseKnobScale: 1,
      baseLabelScale: LABEL_SIZE,
    };
  }
  group.userData.handleParts = parts;
  return group;
}

/** The per-axis parts a handle group was built with, if any. */
function handlePartsOf(group: THREE.Group): Partial<Record<RotationAxis, HandleParts>> {
  const parts = group.userData.handleParts as
    Partial<Record<RotationAxis, HandleParts>> | undefined;
  return parts ?? {};
}

/**
 * Highlight one handle (and its knob and label) while the pointer
 * hovers it, and restore the others. Pass null to clear the highlight.
 * The hovered handle brightens towards white, its knob grows, and its
 * label grows — the other two handles are left exactly as they were.
 */
export function setHandleHover(group: THREE.Group, axis: RotationAxis | null): void {
  for (const entry of HANDLE_AXES) {
    const parts = handlePartsOf(group)[entry];
    if (parts === undefined) {
      continue;
    }
    const hovered = entry === axis;
    for (const mesh of [parts.arc, parts.arrowhead, parts.knob]) {
      const meshMaterial = mesh.material;
      if (meshMaterial instanceof THREE.MeshBasicMaterial) {
        meshMaterial.color.copy(hovered ? lightenColour(parts.baseColour, 0.45) : parts.baseColour);
      }
    }
    parts.knob.scale.setScalar(hovered ? 1.5 : parts.baseKnobScale);
    parts.label.scale.setScalar(hovered ? parts.baseLabelScale * 1.3 : parts.baseLabelScale);
  }
}

/** Place the handles around a piece's centre at a radius, or hide them. */
export function updateRotationHandles(
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

/** Dispose the handles' geometries and materials. */
export function disposeRotationHandles(group: THREE.Group): void {
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

/**
 * The protractor, shown while a handle is dragged: a circle in the
 * dragged handle's plane with a tick every 22.5°, a radius line to
 * the pointer's angle, and a live angle readout. Built once in the
 * XY plane and re-oriented per axis on show (the ticks are symmetric,
 * so no in-plane rotation is needed).
 */
export function createProtractor(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rotation-protractor';
  group.visible = false;

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i += 1) {
    const a = (i / 64) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  const circle = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x333333 }),
  );
  circle.name = 'rotation-protractor-circle';
  group.add(circle);

  const tickPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const long = i % 2 === 0;
    const inner = long ? 0.88 : 0.93;
    tickPoints.push(
      new THREE.Vector3(Math.cos(a) * inner, Math.sin(a) * inner, 0),
      new THREE.Vector3(Math.cos(a), Math.sin(a), 0),
    );
  }
  const ticks = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(tickPoints),
    new THREE.LineBasicMaterial({ color: 0x666666 }),
  );
  ticks.name = 'rotation-protractor-ticks';
  group.add(ticks);

  const radiusLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0xd03f43 }),
  );
  radiusLine.name = 'rotation-protractor-radius';
  group.add(radiusLine);

  const label = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, depthTest: false }));
  label.name = 'rotation-protractor-label';
  label.scale.setScalar(0.5);
  label.position.set(1.15, 0, 0);
  group.add(label);

  group.userData.protractorLabel = label;
  group.userData.protractorRadiusLine = radiusLine;
  return group;
}

function protractorLabelOf(group: THREE.Group): THREE.Sprite | undefined {
  return group.userData.protractorLabel as THREE.Sprite | undefined;
}

function protractorRadiusLineOf(group: THREE.Group): THREE.Line | undefined {
  return group.userData.protractorRadiusLine as THREE.Line | undefined;
}

/** Show the protractor in one axis's plane, around a centre, at a radius, with an angle. */
export function showProtractor(
  group: THREE.Group,
  axis: RotationAxis,
  centre: THREE.Vector3,
  radius: number,
  angleDeg: number,
): void {
  group.visible = true;
  group.position.copy(centre);
  group.scale.setScalar(radius);
  if (axis === 'x') {
    group.rotation.set(0, Math.PI / 2, 0);
  } else if (axis === 'y') {
    group.rotation.set(Math.PI / 2, 0, 0);
  } else {
    group.rotation.set(0, 0, 0);
  }
  updateProtractorAngle(group, angleDeg);
}

/** Move the protractor's radius line and angle readout to a new angle, in degrees. */
export function updateProtractorAngle(group: THREE.Group, angleDeg: number): void {
  const a = THREE.MathUtils.degToRad(angleDeg);
  const line = protractorRadiusLineOf(group);
  if (line !== undefined) {
    const positions = (line.geometry.getAttribute('position') as THREE.BufferAttribute)
      .array as Float32Array;
    positions[3] = Math.cos(a);
    positions[4] = Math.sin(a);
    positions[5] = 0;
    line.geometry.getAttribute('position').needsUpdate = true;
  }
  const label = protractorLabelOf(group);
  if (label !== undefined) {
    label.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0);
    setProtractorLabelText(label, `${Math.round(angleDeg)}°`);
  }
}

function setProtractorLabelText(label: THREE.Sprite, text: string): void {
  const material = label.material;
  if (typeof document === 'undefined') {
    // No canvas in the test environment: record the text instead.
    label.userData.labelText = text;
    return;
  }
  const oldMap = material.map;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context === null) {
    return;
  }
  context.fillStyle = '#ffffff';
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(4, 4, 120, 56, 12);
    context.fill();
  } else {
    context.fillRect(4, 4, 120, 56);
  }
  context.fillStyle = '#111111';
  context.font = 'bold 36px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 64, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  material.map = texture;
  material.needsUpdate = true;
  if (oldMap !== null) {
    oldMap.dispose();
  }
  label.userData.labelText = text;
}

/** Hide the protractor. */
export function hideProtractor(group: THREE.Group): void {
  group.visible = false;
}

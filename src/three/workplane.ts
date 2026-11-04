import * as THREE from 'three';
import { GRID_CELL_MM, WORKPLANE_HALF_MM, WORKPLANE_SIZE_MM } from '../app/constants';

/**
 * The workplane, in scene units of 1 unit = 1 mm, centred on the origin.
 * The top surface is the XZ plane at y = 0; nothing may go below it.
 *
 * This module is pure Three.js — no React, no app state. Later milestones
 * add pieces, holes, and snapping as separate modules that attach to the
 * scene this builds; they never rewrite the workplane itself.
 */

const AXIS_LENGTH_MM = WORKPLANE_HALF_MM;
const AXIS_COLORS = {
  /** X axis — red. */
  x: new THREE.Color(0xd03f43),
  /** Y axis (up) — green. */
  y: new THREE.Color(0x2b8a3e),
  /** Z axis — blue. */
  z: new THREE.Color(0x1971c2),
};

/** Red/green/blue axes through the centre of the workplane. */
function createAxes(): THREE.LineSegments {
  const half = AXIS_LENGTH_MM;
  const positions = new Float32Array([
    // X axis, -half → +half
    -half,
    0,
    0,
    half,
    0,
    0,
    // Y axis, 0 → +half (up only — nothing goes below the workplane)
    0,
    0,
    0,
    0,
    half,
    0,
    // Z axis, -half → +half
    0,
    0,
    -half,
    0,
    0,
    half,
  ]);
  const colors = new Float32Array([
    ...AXIS_COLORS.x.toArray(),
    ...AXIS_COLORS.x.toArray(),
    ...AXIS_COLORS.y.toArray(),
    ...AXIS_COLORS.y.toArray(),
    ...AXIS_COLORS.z.toArray(),
    ...AXIS_COLORS.z.toArray(),
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true });
  return new THREE.LineSegments(geometry, material);
}

/**
 * Build the empty workplane: a white ground plane, a 10 mm grid on top
 * of it, and the red/green/blue axes. No pieces yet (Milestone 2).
 */
export function createWorkplane(): THREE.Group {
  const workplane = new THREE.Group();
  workplane.name = 'workplane';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORKPLANE_SIZE_MM, WORKPLANE_SIZE_MM),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  ground.name = 'workplane-ground';
  ground.rotation.x = -Math.PI / 2;
  // Just below the grid so the two never z-fight.
  ground.position.y = -0.5;
  workplane.add(ground);

  const divisions = WORKPLANE_SIZE_MM / GRID_CELL_MM;
  const grid = new THREE.GridHelper(WORKPLANE_SIZE_MM, divisions, 0x8a8a8a, 0xcccccc);
  grid.name = 'workplane-grid';
  grid.position.y = 0;
  const gridMaterial = grid.material;
  if (!Array.isArray(gridMaterial)) {
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.9;
  }
  workplane.add(grid);

  const axes = createAxes();
  axes.name = 'workplane-axes';
  workplane.add(axes);

  return workplane;
}

/**
 * A perspective camera placed on the (1, 1, 1) diagonal, far enough back
 * to frame the whole 1,000 mm workplane. Milestone 1 adds the Top /
 * Front / Side / 3D camera presets; this is the default 3D view.
 */
export function createFramingCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, aspect, 1, 10000);
  const distance = 700;
  camera.position.set(distance, distance, distance);
  camera.lookAt(0, 0, 0);
  return camera;
}

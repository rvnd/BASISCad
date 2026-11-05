import { WORKPLANE_HALF_MM } from '../app/constants';

/**
 * Camera view presets — pure data, no Three.js imports.
 *
 * The scene is Y-up: the workplane is the XZ plane at y = 0, X is red,
 * Y (up) is green, Z is blue. The prototype's plan frame instead had Z
 * up and Y as depth on the workplane, so the prototype's depth axis maps
 * to scene Z here: Front is the +Z edge of the workplane (the edge
 * nearest the default 3D camera), Back is −Z, Left is −X, Right is +X.
 *
 * Every view looks at the workplane centre (0, 0, 0). Side views sit
 * slightly above the plane so the grid stays visible instead of being
 * seen exactly edge-on. The 3D view is the Milestone 0 framing camera
 * on the (1, 1, 1) diagonal. All positions stay inside the viewport's
 * OrbitControls distance limits (100–4,000 mm).
 */

/** A camera preset: its id, the label shown in the dropdown, and where the camera sits (mm). */
export interface CameraView {
  id: CameraViewId;
  label: string;
  position: readonly [number, number, number];
}

export type CameraViewId = 'top' | 'front' | 'back' | 'left' | 'right' | '3d';

/** Distance from the centre for the Top and side views (mm). */
const VIEW_DISTANCE_MM = 1400;
/** Height above the workplane for the side views (mm) — just enough to see the grid. */
const SIDE_VIEW_HEIGHT_MM = 250;
/** The 3D view matches the Milestone 0 framing camera exactly. */
const DIAGONAL_MM = 700;

/** The six views, in dropdown order: Top, Front, Back, Left, Right, then 3D last. */
export const CAMERA_VIEWS: readonly CameraView[] = [
  { id: 'top', label: 'Top', position: [0, VIEW_DISTANCE_MM, 0] },
  { id: 'front', label: 'Front', position: [0, SIDE_VIEW_HEIGHT_MM, VIEW_DISTANCE_MM] },
  { id: 'back', label: 'Back', position: [0, SIDE_VIEW_HEIGHT_MM, -VIEW_DISTANCE_MM] },
  { id: 'left', label: 'Left', position: [-VIEW_DISTANCE_MM, SIDE_VIEW_HEIGHT_MM, 0] },
  { id: 'right', label: 'Right', position: [VIEW_DISTANCE_MM, SIDE_VIEW_HEIGHT_MM, 0] },
  { id: '3d', label: '3D', position: [DIAGONAL_MM, DIAGONAL_MM, DIAGONAL_MM] },
];

/** The view the app starts on. */
export const DEFAULT_CAMERA_VIEW_ID: CameraViewId = '3d';

/** Look a view up by id; returns undefined for an unknown id. */
export function getCameraView(id: CameraViewId): CameraView | undefined {
  return CAMERA_VIEWS.find((view) => view.id === id);
}

/** True when a position sits above the workplane (y > 0). */
export function isAboveWorkplane(position: readonly [number, number, number]): boolean {
  return position[1] > 0;
}

/** True when a position is far enough out to frame the whole workplane. */
export function framesWorkplane(position: readonly [number, number, number]): boolean {
  const [x, y, z] = position;
  const distance = Math.sqrt(x * x + y * y + z * z);
  return distance >= WORKPLANE_HALF_MM;
}

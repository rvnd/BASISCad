export const GRAVITY_PRESETS = [
  { name: 'Moon', acceleration: 1.62 },
  { name: 'Mars', acceleration: 3.71 },
  { name: 'Earth', acceleration: 9.81 },
] as const;
export const GRAVITY_STEP_SECONDS = 1 / 60;
export const GRAVITY_MAX_SECONDS = 30;
export type GravityStatus = 'idle' | 'loading' | 'running' | 'paused' | 'settled' | 'error';
export interface GravityVector {
  x: number;
  y: number;
  z: number;
}
export interface GravityRotation extends GravityVector {
  w: number;
}
/** Origins match the rendered mesh; no editing floor lift or angle snapping applies to frames. */
export interface GravityPiece {
  id: string;
  shapeId: string;
  originMm: GravityVector;
  rotation: GravityRotation;
  fastenerFor?: readonly string[];
}
export interface GravityShape {
  id: string;
  name: string;
  positionsMm: Float32Array<ArrayBuffer>;
  steel: boolean;
}
export interface GravityConnection {
  id: string;
  pieces: readonly string[];
  pivotMm: GravityVector;
  axis: GravityVector;
}
export interface GravityInput {
  pieces: readonly GravityPiece[];
  shapes: readonly GravityShape[];
  connections: readonly GravityConnection[];
  acceleration: number;
}
/** Seven values per piece in input order: render origin in mm, then quaternion x/y/z/w. */
export interface GravityFrame {
  poses: Float32Array<ArrayBuffer>;
  seconds: number;
  awake: number;
}
export interface GravitySummary {
  bodies: number;
  hinges: number;
  colliders: number;
  massGrams: number;
}
export type GravityRequest =
  | { type: 'start'; input: GravityInput }
  | { type: 'pause' | 'resume' | 'ack' }
  | { type: 'gravity'; acceleration: number };
export type GravityResponse =
  | { type: 'ready'; summary: GravitySummary }
  | { type: 'frame' | 'paused' | 'settled'; frame: GravityFrame }
  | { type: 'error'; message: string };

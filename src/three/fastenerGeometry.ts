import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlacedPiece } from '../app/design';

export const SCREW_DIAMETER_MM = 3.505;
export const NUT_HEIGHT_MM = 2.4;
const cache = new Map<string, THREE.BufferGeometry>();

/** The shaft/head are one closed surface; the hex nut has an actual central bore. */
export function fastenerGeometry(piece: PlacedPiece): THREE.BufferGeometry | undefined {
  const unit = piece.fastener;
  if (!unit) return undefined;
  const key = `${unit.lengthInches}-${unit.stackDepthMm.toFixed(5)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const length = unit.lengthInches * 25.4;
  const nutBottom = length - unit.stackDepthMm - NUT_HEIGHT_MM;
  const radius = SCREW_DIAMETER_MM / 2;
  const screw = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(radius, 0),
      new THREE.Vector2(radius, length),
      new THREE.Vector2(3.35, length),
      new THREE.Vector2(3.35, length + 1.8),
      new THREE.Vector2(0, length + 1.8),
    ],
    24,
  );
  const hex = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = 4.58 * Math.cos(angle),
      y = 4.58 * Math.sin(angle);
    if (i === 0) hex.moveTo(x, y);
    else hex.lineTo(x, y);
  }
  hex.closePath();
  const bore = new THREE.Path();
  bore.absarc(0, 0, 1.82, 0, Math.PI * 2, true);
  hex.holes.push(bore);
  const nut = new THREE.ExtrudeGeometry(hex, {
    depth: NUT_HEIGHT_MM,
    bevelEnabled: false,
    curveSegments: 16,
  })
    .rotateX(-Math.PI / 2)
    .translate(0, nutBottom, 0);
  const flatScrew = screw.toNonIndexed();
  // Only position and normal are used; matching attributes keep geometry merging predictable.
  flatScrew.deleteAttribute('uv');
  nut.deleteAttribute('uv');
  const merged = mergeGeometries([flatScrew, nut]);
  screw.dispose();
  flatScrew.dispose();
  nut.dispose();
  if (!merged) throw new Error('Could not construct screw and nut geometry.');
  merged.translate(0, -Math.min(0, nutBottom), 0);
  merged.computeBoundingBox();
  cache.set(key, merged);
  return merged;
}

/** Coordinate of the stack's lower face in the fastener's canonical Y-up geometry. */
export function fastenerStackBottom(piece: PlacedPiece): number {
  const unit = piece.fastener!;
  return Math.max(NUT_HEIGHT_MM, unit.lengthInches * 25.4 - unit.stackDepthMm);
}

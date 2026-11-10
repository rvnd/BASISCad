import * as THREE from 'three';
import type { PlacedPiece } from '../app/design';
import type { LibraryPiece } from '../app/library';
import type { LabelMode } from '../app/labels';
import { fastenerName } from '../app/connections';
import { geometryLookup, pieceBounds } from './designConstraints';

export interface ScreenPoint {
  x: number;
  y: number;
}
export interface DimensionLine {
  text: string;
  start: ScreenPoint;
  end: ScreenPoint;
  fromStart: ScreenPoint;
  fromEnd: ScreenPoint;
  textAt: ScreenPoint;
}
export interface BlueprintLabel {
  id: string;
  name: string;
  anchor: ScreenPoint;
  position: ScreenPoint;
  offset: ScreenPoint;
  dimensions: readonly DimensionLine[];
}

/** Plain projected annotations shared by the interactive viewport and print renderer. */
export function projectBlueprintLabels(
  placed: readonly PlacedPiece[],
  library: ReadonlyMap<string, LibraryPiece>,
  camera: THREE.Camera,
  width: number,
  height: number,
  mode: LabelMode,
): readonly BlueprintLabel[] {
  if (mode === 'off' || width <= 0 || height <= 0) return [];
  camera.updateMatrixWorld();
  const geometry = geometryLookup(library),
    result: BlueprintLabel[] = [];
  const project = (point: THREE.Vector3): ScreenPoint => {
    const p = point.clone().project(camera);
    return { x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 };
  };
  for (const piece of placed) {
    const mesh = geometry(piece),
      meta = library.get(piece.libraryId);
    if (!mesh || piece.label?.hidden) continue;
    const box = pieceBounds(piece, mesh),
      center = box.getCenter(new THREE.Vector3()),
      clip = center.clone().project(camera);
    if (clip.z < -1 || clip.z > 1) continue;
    const anchor = project(center);
    if (anchor.x < 0 || anchor.x > width || anchor.y < 0 || anchor.y > height) continue;
    const name = piece.fastener ? fastenerName(piece.fastener) : (meta?.name ?? 'Piece');
    let offset = piece.label?.offset ?? (mode === 'names' ? { x: 24, y: -32 } : { x: 0, y: 0 });
    if (mode === 'names' && !piece.label?.offset) {
      let attempt = 0;
      while (
        result.some(
          (label) =>
            Math.abs(label.position.x - (anchor.x + offset.x)) < 160 &&
            Math.abs(label.position.y - (anchor.y + offset.y)) < 25,
        ) &&
        attempt++ < 20
      )
        offset = { x: 24, y: -32 - attempt * 26 };
    }
    const position = { x: anchor.x + offset.x, y: anchor.y + offset.y },
      dimensions: DimensionLine[] = [];
    if (mode === 'measurements') {
      const gap = Math.max(5, box.getSize(new THREE.Vector3()).length() * 0.12);
      for (const axis of ['x', 'y', 'z'] as const) {
        const a = box.max.clone(),
          b = box.max.clone();
        a[axis] = box.min[axis];
        const c = a.clone(),
          d = b.clone();
        if (axis === 'x') {
          c.z += gap;
          d.z += gap;
        } else {
          c.x += gap;
          d.x += gap;
        }
        const start = project(c),
          end = project(d);
        start.x += offset.x;
        start.y += offset.y;
        end.x += offset.x;
        end.y += offset.y;
        // An axis viewed end-on still has a readable dimension callout.
        if (Math.hypot(end.x - start.x, end.y - start.y) < 10) end.y = start.y - 28;
        const textAt = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 8 };
        const existing = [...result.flatMap((label) => label.dimensions), ...dimensions];
        let attempts = 0;
        while (
          existing.some(
            (label) =>
              Math.abs(label.textAt.x - textAt.x) < 75 && Math.abs(label.textAt.y - textAt.y) < 22,
          ) &&
          attempts++ < 40
        )
          textAt.y -= 24;
        dimensions.push({
          text: `${axis.toUpperCase()} ${(box.max[axis] - box.min[axis]).toFixed(1)} mm`,
          start,
          end,
          fromStart: project(a),
          fromEnd: project(b),
          textAt,
        });
      }
    }
    result.push({ id: piece.id, name, anchor, position, offset, dimensions });
  }
  return result;
}

import type { PositionMm } from './design';

export interface LibraryHole {
  center: PositionMm;
  axis: PositionMm;
  radius: number;
}

function vector(value: unknown): PositionMm | null {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) return null;
  return { x: value[0], y: value[1], z: value[2] };
}

/** Read the generator's hole data without letting malformed files create phantom holes. */
export function parseLibraryHoles(
  value: unknown,
): Readonly<Record<string, readonly LibraryHole[]>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Record<string, LibraryHole[]> = {};
  for (const [id, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    const holes: LibraryHole[] = [];
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;
      const center = vector(entry.center);
      const axis = vector(entry.axis);
      if (!center || !axis || !Number.isFinite(entry.radius) || entry.radius <= 0) continue;
      const length = Math.hypot(axis.x, axis.y, axis.z);
      if (length < 1e-8) continue;
      holes.push({
        center,
        axis: { x: axis.x / length, y: axis.y / length, z: axis.z / length },
        radius: entry.radius,
      });
    }
    result[id] = holes;
  }
  return result;
}

import type { RotationAxis } from '../three/rotationHandles';

export interface TabletAction {
  kind: 'move' | 'rotate';
  axis: RotationAxis;
}

export function isTabletInput(input: {
  touchPoints: number;
  coarsePointer: boolean;
  width: number;
  height: number;
}): boolean {
  return (
    input.touchPoints >= 2 && input.coarsePointer && Math.min(input.width, input.height) >= 600
  );
}

export function axisDragDelta(
  delta: { x: number; y: number },
  projection: { x: number; y: number },
): number {
  const lengthSquared = projection.x ** 2 + projection.y ** 2;
  return lengthSquared < 1e-12
    ? 0
    : (delta.x * projection.x + delta.y * projection.y) / lengthSquared;
}

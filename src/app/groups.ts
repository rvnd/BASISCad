import type { PlacedPiece } from './design';

export function groupSelection(
  placed: readonly PlacedPiece[],
  ids: readonly string[],
): ReadonlySet<string> {
  const selected = new Set(ids);
  const groups = new Set(
    placed.filter((piece) => selected.has(piece.id) && piece.groupId).map((piece) => piece.groupId),
  );
  for (const piece of placed)
    if (piece.groupId && groups.has(piece.groupId)) selected.add(piece.id);
  return selected;
}

export function selectPiece(
  placed: readonly PlacedPiece[],
  selected: readonly string[],
  id: string,
  additive: boolean,
): readonly string[] {
  const targets = groupSelection(placed, [id]);
  if (!additive) return [...targets];
  return [...targets].every((target) => selected.includes(target))
    ? selected.filter((target) => !targets.has(target))
    : [...new Set([...selected, ...targets])];
}

/** Editing groups and physical screw connections both carry their members during rigid movement. */
export function motionIds(
  placed: readonly PlacedPiece[],
  ids: readonly string[],
): ReadonlySet<string> {
  let joined = new Set(ids),
    changed = true;
  while (changed) {
    const before = joined.size;
    joined = new Set(groupSelection(placed, [...joined]));
    for (const unit of placed)
      if (
        unit.fastener &&
        (joined.has(unit.id) || unit.fastener.holes.some((hole) => joined.has(hole.pieceId)))
      ) {
        joined.add(unit.id);
        for (const hole of unit.fastener.holes) joined.add(hole.pieceId);
      }
    changed = joined.size !== before;
  }
  return joined;
}

export function createGroup(
  placed: readonly PlacedPiece[],
  ids: readonly string[],
  groupId: string,
): readonly PlacedPiece[] {
  const selected = new Set(groupSelection(placed, ids));
  for (const unit of placed)
    if (unit.fastener?.holes.every((hole) => selected.has(hole.pieceId))) selected.add(unit.id);
  if (selected.size < 2) return placed;
  return placed.map((piece) =>
    selected.has(piece.id) ? { ...piece, groupId, groupRotation: { x: 0, y: 0, z: 0 } } : piece,
  );
}

export function ungroup(
  placed: readonly PlacedPiece[],
  ids: readonly string[],
): readonly PlacedPiece[] {
  const selected = groupSelection(placed, ids);
  if (!placed.some((piece) => selected.has(piece.id) && piece.groupId)) return placed;
  return placed.map((piece) =>
    selected.has(piece.id) ? { ...piece, groupId: undefined, groupRotation: undefined } : piece,
  );
}

export function toggleLock(
  placed: readonly PlacedPiece[],
  ids: readonly string[],
): readonly PlacedPiece[] {
  const selected = groupSelection(placed, ids),
    pieces = placed.filter((piece) => selected.has(piece.id));
  if (!pieces.length) return placed;
  const locked = !pieces.every((piece) => piece.locked);
  return placed.map((piece) => (selected.has(piece.id) ? { ...piece, locked } : piece));
}

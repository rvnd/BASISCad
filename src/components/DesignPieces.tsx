import { memo } from 'react';

interface Entry {
  id: string;
  name: string;
  locked: boolean;
  grouped: boolean;
}
interface Props {
  pieces: readonly Entry[];
  selectedIds: readonly string[];
  disabled: boolean;
  onSelect: (id: string, additive: boolean) => void;
}
const PieceButton = memo(function PieceButton({
  id,
  name,
  index,
  locked,
  grouped,
  selected,
  disabled,
  onSelect,
}: Entry & { index: number; selected: boolean; disabled: boolean; onSelect: Props['onSelect'] }) {
  return (
    <li>
      <button
        type="button"
        className="design-piece-button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={(event) => onSelect(id, event.shiftKey)}
      >
        <span>
          {index + 1}. {name}
        </span>
        {(locked || grouped) && (
          <small>{[locked && 'Locked', grouped && 'Group'].filter(Boolean).join(' · ')}</small>
        )}
      </button>
    </li>
  );
});
export default function DesignPieces({ pieces, selectedIds, disabled, onSelect }: Props) {
  const selected = new Set(selectedIds);
  return (
    <details className="panel design-pieces" open>
      <summary>Design pieces ({pieces.length})</summary>
      <p className="panel-note" role="status">
        {selectedIds.length} selected
      </p>
      <p className="panel-note">
        Select a piece here or on the workplane. Shift-click adds or removes it from the selection.
      </p>
      <p className="panel-note">
        Tab to the workplane to use arrow keys: Move 1 mm (Shift 10 mm), Rotate 22.5°. Escape clears
        the selection.
      </p>
      <ol aria-label="Design pieces" className="design-pieces-list">
        {pieces.map((piece, index) => (
          <PieceButton
            key={piece.id}
            {...piece}
            index={index}
            selected={selected.has(piece.id)}
            disabled={disabled}
            onSelect={onSelect}
          />
        ))}
      </ol>
      {!pieces.length && <p className="panel-note">Place a piece from Shapes to begin.</p>}
    </details>
  );
}

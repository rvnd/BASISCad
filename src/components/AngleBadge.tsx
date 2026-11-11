import { useRef, useState } from 'react';
import { parseAngleInput } from '../app/rotation';
import { HANDLE_AXIS_HEX } from '../three/rotationHandles';
import type { RotationAxis } from '../three/rotationHandles';

/**
 * The big live angle badge (Milestone 4): a large "X 22.5°" pill in the
 * dragged axis's colour, overlaid at the bottom centre of the
 * viewport while a rotation handle is dragged, updating live from the
 * piece's rotation. It never blocks the canvas — the wrapper ignores
 * pointer input and only the badge itself (or its input, while
 * editing) takes it.
 *
 * Clicking the badge turns it into a text input for that axis: type
 * an angle and press Enter (or leave the field) to round it to 22.5° increments,
 * like the panel's typed angle fields ("-30" sets -22.5). Escape cancels and restores the badge.
 *
 * The badge cannot be clicked in the middle of a drag (the pointer is
 * busy dragging), so it lingers after release while the piece stays
 * selected in Rotate mode — that is what makes click-to-type possible
 * at all. It hides when the piece is deselected or the mode leaves
 * Rotate; the App owns that.
 */

/** Show a whole number without decimals, otherwise one decimal. */
function formatAngleValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

interface AngleBadgeProps {
  /** The axis being dragged (or just dragged), and its live angle. */
  axis: RotationAxis;
  angle: number;
  /** Apply a typed absolute angle to this axis, normalised as usual. */
  onSetAngle: (axis: RotationAxis, degrees: number) => void;
}

export default function AngleBadge({ axis, angle, onSetAngle }: AngleBadgeProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Escape unmounts the input, which can still fire a blur — the flag
  // stops that blur from applying a cancelled draft.
  const cancellingRef = useRef(false);
  const dirty = useRef(false);
  const hex = HANDLE_AXIS_HEX[axis];

  const commit = (): void => {
    if (cancellingRef.current) {
      cancellingRef.current = false;
      return;
    }
    const parsed = parseAngleInput(draft);
    setEditing(false);
    if (dirty.current && parsed !== null) {
      onSetAngle(axis, parsed);
    }
    dirty.current = false;
  };

  if (editing) {
    return (
      <div className="angle-badge-wrap" aria-label="Type an angle">
        <input
          className="angle-badge-input"
          type="text"
          inputMode="decimal"
          value={draft}
          autoFocus
          aria-label={`Type an angle for ${axis.toUpperCase()}`}
          style={{ borderColor: hex, color: hex }}
          onChange={(event) => {
            dirty.current = true;
            setDraft(event.target.value);
          }}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            // Escape cancels without applying; Enter commits via blur.
            // Stop the key reaching anything else (a dropdown's Escape
            // handler, say) while the badge is being typed in.
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              cancellingRef.current = true;
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="angle-badge-wrap">
      <button
        type="button"
        className="angle-badge"
        style={{ borderColor: hex, color: hex }}
        title="Click to type an angle"
        aria-label={`Angle about ${axis.toUpperCase()}: ${formatAngleValue(angle)} degrees. Click to type an angle.`}
        onClick={() => {
          dirty.current = false;
          cancellingRef.current = false;
          setDraft(formatAngleValue(angle));
          setEditing(true);
        }}
      >
        {axis.toUpperCase()} {formatAngleValue(angle)}°
      </button>
    </div>
  );
}

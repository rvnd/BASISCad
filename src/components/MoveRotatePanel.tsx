import { useState } from 'react';
import type { PositionMm, RotationDeg, SelectionMode } from '../app/design';
import { MANUAL_ROTATION_STEP_DEG } from '../app/rotation';
import { parseAngleInput, parsePositionInput } from '../app/rotation';
import { HANDLE_AXIS_COLOUR_NAMES, HANDLE_AXIS_HEX } from '../three/rotationHandles';
import type { RotationAxis } from '../three/rotationHandles';

/**
 * Move and rotate controls (Milestone 4), as an overlay panel in the
 * top-right corner of the workplane. It only exists while something
 * is selected, and it never covers the Shapes panel or the header —
 * it lives inside the viewport column.
 *
 * With one piece selected it shows that piece's live values: its
 * X/Y/Z angles at all times, and Move fields for X, Y (height above
 * the workplane), and Z. Typing a value and pressing Enter (or
 * leaving the field) applies it; an invalid value reverts to the
 * current one. With several pieces selected the step and
 * reset buttons apply to all of them together, and the typed fields
 * are disabled with a note — an exact position only means something
 * for one piece.
 */

type Axis = 'x' | 'y' | 'z';

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/** Show a whole number without decimals, otherwise one decimal. */
function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

interface NumberFieldProps {
  label: string;
  /** The live value, shown whenever the user is not editing. */
  value: number;
  unit: string;
  disabled: boolean;
  /** Colour dot shown by the label, matching the handle of this axis. */
  accentHex?: string;
  /** Called with the typed value when the user commits it. */
  onCommit: (value: number) => void;
  parse: (text: string) => number | null;
}

/** A typed number field: Enter or blur commits, anything invalid reverts. */
function NumberField({
  label,
  value,
  unit,
  disabled,
  accentHex,
  onCommit,
  parse,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(formatNumber(value));
  // When the live value changes from outside (a step button, a drag,
  // another field), the draft follows it. This is the render-time
  // adjustment React documents for syncing state from props — no
  // effect, so editing is never interrupted by a re-render.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(formatNumber(value));
  }

  const commit = (): void => {
    const parsed = parse(draft);
    if (parsed === null) {
      setDraft(formatNumber(value));
      return;
    }
    onCommit(parsed);
    setDraft(formatNumber(value));
  };

  return (
    <label className="field">
      <span className="field-label">
        {accentHex !== undefined && (
          <span className="axis-dot" style={{ backgroundColor: accentHex }} aria-hidden="true" />
        )}
        {label} <span className="field-unit">({unit})</span>
      </span>
      <input
        className="field-input"
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        aria-label={`${label} in ${unit}`}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export interface SingleSelection {
  id: string;
  name: string;
  position: PositionMm;
  rotation: RotationDeg;
  locked: boolean;
  hinge?: { angle: number; available: boolean };
}

interface MoveRotatePanelProps {
  /** The single selected piece, or null when several are selected. */
  single: SingleSelection | null;
  selectedCount: number;
  mode: SelectionMode;
  /** The rotation handle the pointer currently hovers, if any. */
  hoverAxis: RotationAxis | null;
  onSetMode: (mode: SelectionMode) => void;
  onMove: (axis: Axis, value: number) => void;
  onRotateStep: (axis: Axis, direction: 1 | -1) => void;
  onSetAngle: (axis: Axis, degrees: number) => void;
  onResetOrientation: () => void;
  hingeMode: boolean;
  onHingeMode: () => void;
  onHingeAngle: (angle: number) => void;
}

export default function MoveRotatePanel({
  single,
  selectedCount,
  mode,
  hoverAxis,
  onSetMode,
  onMove,
  onRotateStep,
  onSetAngle,
  onResetOrientation,
  hingeMode,
  onHingeMode,
  onHingeAngle,
}: MoveRotatePanelProps) {
  if (selectedCount === 0) {
    return null;
  }
  const title = single === null ? `${selectedCount} pieces selected` : single.name;

  return (
    <section className="move-rotate-panel" aria-label="Move and rotate">
      <h2 className="panel-title">{title}</h2>
      <div className="segmented" role="group" aria-label="Selection mode">
        <button
          type="button"
          className="segmented-button"
          aria-pressed={!hingeMode && mode === 'move'}
          onClick={() => {
            onSetMode('move');
          }}
        >
          Move
        </button>
        <button
          type="button"
          className="segmented-button"
          aria-pressed={!hingeMode && mode === 'rotate'}
          onClick={() => {
            onSetMode('rotate');
          }}
        >
          Rotate
        </button>
        {single?.hinge && (
          <button
            type="button"
            className="segmented-button"
            aria-pressed={hingeMode}
            disabled={!single.hinge.available}
            onClick={onHingeMode}
          >
            Swing / Hinge
          </button>
        )}
      </div>
      {single?.locked && (
        <p className="panel-note">Locked. Unlock the selection to move or rotate it.</p>
      )}
      {single?.hinge && !single.hinge.available && !single.locked && (
        <p className="panel-note">
          This joint is fixed. Ungroup or remove a second screw to swing it.
        </p>
      )}
      {hingeMode ? (
        <>
          <p className="panel-note">
            Drag the piece around its screw in 22.5° steps, or type an angle rounded to 22.5°. The
            screw and the other pieces stay fixed.
          </p>
          <NumberField
            label="Hinge angle"
            value={single?.hinge?.angle ?? 0}
            unit="°"
            disabled={!single?.hinge?.available}
            parse={parseAngleInput}
            onCommit={onHingeAngle}
          />
        </>
      ) : (
        <>
          <fieldset className="pose-controls" disabled={single?.locked}>
            <p className="panel-note">
              {mode === 'move'
                ? 'Drag the piece to move it, or type exact coordinates below. Switch to Rotate to show the rotation handles.'
                : 'Drag a curved arrow handle to turn about that axis in 22.5° steps, or drag the piece itself to turn about Y (up). Typed angles round to the nearest 22.5°.'}
            </p>
            {hoverAxis !== null && (
              <p
                className="handle-hover-note"
                style={{ color: HANDLE_AXIS_HEX[hoverAxis] }}
                aria-live="polite"
              >
                Drag to rotate about {hoverAxis.toUpperCase()} — grab the{' '}
                {HANDLE_AXIS_COLOUR_NAMES[hoverAxis]} curved arrow.
              </p>
            )}
            <p className="handle-legend">
              <span style={{ color: HANDLE_AXIS_HEX.x }}>● Red = X</span>
              {', '}
              <span style={{ color: HANDLE_AXIS_HEX.y }}>● Green = Y</span>
              {', '}
              <span style={{ color: HANDLE_AXIS_HEX.z }}>● Blue = Z</span>
              {' — drag a curved arrow handle, or use the buttons.'}
            </p>

            <h3 className="move-rotate-heading">Move</h3>
            {single === null ? (
              <p className="panel-note">Select a single piece to type exact coordinates.</p>
            ) : (
              <div className="field-row">
                {AXES.map((axis) => (
                  <NumberField
                    key={axis}
                    label={axis === 'y' ? 'Y · height' : axis.toUpperCase()}
                    value={single.position[axis]}
                    unit="mm"
                    disabled={single.locked}
                    accentHex={HANDLE_AXIS_HEX[axis]}
                    parse={parsePositionInput}
                    onCommit={(value) => {
                      onMove(axis, value);
                    }}
                  />
                ))}
              </div>
            )}

            <h3 className="move-rotate-heading">Rotate</h3>
            {single === null ? (
              <p className="panel-note">
                Select a single piece to type angles rounded to 22.5°. The step and reset buttons
                below apply to every selected piece.
              </p>
            ) : (
              <div className="field-row">
                {AXES.map((axis) => (
                  <NumberField
                    key={axis}
                    label={`${axis.toUpperCase()} angle`}
                    value={single.rotation[axis]}
                    unit="°"
                    disabled={single.locked}
                    accentHex={HANDLE_AXIS_HEX[axis]}
                    parse={parseAngleInput}
                    onCommit={(value) => {
                      onSetAngle(axis, value);
                    }}
                  />
                ))}
              </div>
            )}
            <p className="step-row" aria-label="Rotation step size">
              <span className="step-label">Step: {MANUAL_ROTATION_STEP_DEG}°</span>
            </p>
            {AXES.map((axis) => (
              <div key={axis} className="rotate-row">
                <span
                  className="rotate-axis"
                  style={{ backgroundColor: HANDLE_AXIS_HEX[axis], color: '#ffffff' }}
                >
                  {axis.toUpperCase()}
                </span>
                <button
                  type="button"
                  className="control-button rotate-button"
                  aria-label={`Rotate ${axis.toUpperCase()} by minus ${MANUAL_ROTATION_STEP_DEG} degrees`}
                  onClick={() => {
                    onRotateStep(axis, -1);
                  }}
                >
                  −{MANUAL_ROTATION_STEP_DEG}°
                </button>
                <button
                  type="button"
                  className="control-button rotate-button"
                  aria-label={`Rotate ${axis.toUpperCase()} by plus ${MANUAL_ROTATION_STEP_DEG} degrees`}
                  onClick={() => {
                    onRotateStep(axis, 1);
                  }}
                >
                  +{MANUAL_ROTATION_STEP_DEG}°
                </button>
              </div>
            ))}
            <button type="button" className="control-button" onClick={onResetOrientation}>
              Reset orientation
            </button>
          </fieldset>
        </>
      )}
    </section>
  );
}

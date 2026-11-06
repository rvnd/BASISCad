import CameraViewsDropdown from './CameraViewsDropdown';
import type { CameraViewId } from '../three/cameraViews';
import type { SelectionMode } from '../app/design';

/**
 * The left column: view and zoom controls for the workplane, plus the
 * selection readout and trash can (Milestone 3) at the bottom.
 *
 * Zoom in/out dolly the camera along its current direction; Fit resets
 * to the Milestone 0 framing (the 3D diagonal, whole workplane in view)
 * and therefore also returns the view label to 3D. Orbit stays a drag
 * on the canvas itself. Nothing here touches Three.js objects — it calls
 * the viewport handle the App hands down, and the App owns the design.
 */

interface ViewControlsProps {
  currentView: CameraViewId;
  onSelectView: (viewId: CameraViewId) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** True once the 3D viewport exists, so the buttons can actually act. */
  disabled: boolean;
  /** Selected placed pieces, in selection order. */
  selectedPieces: readonly { id: string; name: string }[];
  /** What the selection is doing — Move drags pieces, Rotate turns them. */
  selectionMode: SelectionMode;
  /** Remove the selected pieces from the design (not from the library). */
  onRemoveSelected: () => void;
  hasPieces: boolean;
  onCenterProject: () => void;
  snapHoles: boolean;
  onSnapHolesChange: (enabled: boolean) => void;
}

export default function ViewControls({
  currentView,
  onSelectView,
  onZoomIn,
  onZoomOut,
  onFit,
  disabled,
  selectedPieces,
  selectionMode,
  onRemoveSelected,
  hasPieces,
  onCenterProject,
  snapHoles,
  onSnapHolesChange,
}: ViewControlsProps) {
  return (
    <aside className="side-column left-column" aria-label="View controls">
      <section className="panel" aria-label="Zoom">
        <h2 className="panel-title">View</h2>
        <div className="zoom-row">
          <button
            type="button"
            className="control-button zoom-button"
            aria-label="Zoom in"
            disabled={disabled}
            onClick={onZoomIn}
          >
            +
          </button>
          <button
            type="button"
            className="control-button zoom-button"
            aria-label="Zoom out"
            disabled={disabled}
            onClick={onZoomOut}
          >
            −
          </button>
        </div>
        <button type="button" className="control-button" disabled={disabled} onClick={onFit}>
          Fit
        </button>
        <button
          type="button"
          className="control-button center-project-button"
          disabled={!hasPieces}
          onClick={onCenterProject}
        >
          Center Project
        </button>
        <label className="snap-holes-toggle">
          <input
            type="checkbox"
            checked={snapHoles}
            onChange={(event) => onSnapHolesChange(event.currentTarget.checked)}
          />
          <span>Snap holes</span>
        </label>
        <p className="panel-note">Hold Alt while dragging to move freely.</p>
        <CameraViewsDropdown
          currentView={currentView}
          onSelectView={onSelectView}
          disabled={disabled}
        />
      </section>
      <p className="column-hint">Drag the workplane to orbit. Scroll to zoom.</p>
      <section className="panel" aria-label="Selection">
        <h2 className="panel-title">Selection</h2>
        {selectedPieces.length === 0 ? (
          <p className="panel-note">Nothing selected. Click a placed piece to select it.</p>
        ) : (
          <>
            <ul className="selection-list">
              {selectedPieces.map((piece) => (
                <li key={piece.id}>{piece.name}</li>
              ))}
            </ul>
            <p className="panel-note">
              {selectionMode === 'move'
                ? 'Mode: Move — drag the piece to move it. Its rotation is kept.'
                : 'Mode: Rotate — drag the piece to turn it, or drag a coloured ring around it.'}
            </p>
          </>
        )}
        <button
          type="button"
          className="control-button trash-button"
          disabled={selectedPieces.length === 0}
          title={
            selectedPieces.length === 0
              ? 'Select a placed piece first'
              : 'Remove the selected piece from the design (the library keeps it)'
          }
          onClick={onRemoveSelected}
        >
          🗑 Remove from design
        </button>
      </section>
    </aside>
  );
}

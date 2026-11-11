import CameraViewsDropdown from './CameraViewsDropdown';
import type { ReactNode } from 'react';
import type { CameraViewId } from '../three/cameraViews';

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
  designPieces?: ReactNode;
  currentView: CameraViewId;
  onSelectView: (viewId: CameraViewId) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** True once the 3D viewport exists, so the buttons can actually act. */
  disabled: boolean;
  /** Selected placed pieces, in selection order. */
  selectedCount: number;
  /** What the selection is doing — Move drags pieces, Rotate turns them. */
  /** Remove the selected pieces from the design (not from the library). */
  onRemoveSelected: () => void;
  hasPieces: boolean;
  onCenterProject: () => void;
  snapHoles: boolean;
  alignedHoleCount: number;
  onSnapHolesChange: (enabled: boolean) => void;
  fastening: boolean;
  canFasten: boolean;
  onFasten: () => void;
}

export default function ViewControls({
  designPieces,
  currentView,
  onSelectView,
  onZoomIn,
  onZoomOut,
  onFit,
  disabled,
  selectedCount,
  onRemoveSelected,
  hasPieces,
  onCenterProject,
  snapHoles,
  alignedHoleCount,
  onSnapHolesChange,
  fastening,
  canFasten,
  onFasten,
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
        <p className="panel-note" aria-label="Aligned holes" aria-live="polite">
          {alignedHoleCount} aligned holes
        </p>
        <p className="panel-note">Hold Alt while dragging to move freely.</p>
        <CameraViewsDropdown
          currentView={currentView}
          onSelectView={onSelectView}
          disabled={disabled}
        />
      </section>
      <p className="column-hint">Drag the workplane to orbit. Scroll to zoom.</p>
      <div className="selection-actions">
        <button
          type="button"
          className="control-button"
          aria-label="Screw + Nut"
          title="Add a paired screw and nut at an aligned hole"
          aria-pressed={fastening}
          disabled={!canFasten}
          onClick={onFasten}
        >
          ⊕ Screw + Nut
        </button>
        <button
          type="button"
          className="control-button trash-button"
          disabled={selectedCount === 0}
          title={
            selectedCount === 0
              ? 'Select a placed piece first'
              : 'Remove the selected piece from the design (the library keeps it)'
          }
          onClick={onRemoveSelected}
        >
          🗑 Remove from design
        </button>
      </div>
      {designPieces}
    </aside>
  );
}

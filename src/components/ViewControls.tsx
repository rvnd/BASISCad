import CameraViewsDropdown from './CameraViewsDropdown';
import type { CameraViewId } from '../three/cameraViews';

/**
 * The left column: view and zoom controls for the workplane.
 *
 * Zoom in/out dolly the camera along its current direction; Fit resets
 * to the Milestone 0 framing (the 3D diagonal, whole workplane in view)
 * and therefore also returns the view label to 3D. Orbit stays a drag
 * on the canvas itself. Nothing here touches Three.js objects — it calls
 * the viewport handle the App hands down.
 */

interface ViewControlsProps {
  currentView: CameraViewId;
  onSelectView: (viewId: CameraViewId) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** True once the 3D viewport exists, so the buttons can actually act. */
  disabled: boolean;
}

export default function ViewControls({
  currentView,
  onSelectView,
  onZoomIn,
  onZoomOut,
  onFit,
  disabled,
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
        <CameraViewsDropdown
          currentView={currentView}
          onSelectView={onSelectView}
          disabled={disabled}
        />
      </section>
      <p className="column-hint">Drag the workplane to orbit. Scroll to zoom.</p>
    </aside>
  );
}

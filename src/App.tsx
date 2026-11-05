import { useCallback, useRef, useState } from 'react';
import Header from './components/Header.tsx';
import ShapesPanel from './components/ShapesPanel.tsx';
import ViewControls from './components/ViewControls.tsx';
import Viewport from './components/Viewport.tsx';
import { DEFAULT_CAMERA_VIEW_ID } from './three/cameraViews';
import type { CameraViewId } from './three/cameraViews';
import type { ViewportHandle } from './three/viewport';

/**
 * App shell — composition and view state only, no 3D logic.
 *
 * Milestone 1 layout: black header on top, then a row with the view
 * controls in a narrow left column, the Three.js viewport filling the
 * centre, and the Shapes panel on the right. The viewport handle lives
 * in a ref (never in state, never in React's hands as an object to
 * render); the view controls call its methods imperatively. The current
 * view label is React state, updated only when a preset is picked or
 * Fit is pressed — dragging the canvas to orbit does not change it.
 * Milestone 5 adds design state (name, save, undo) above this
 * component.
 */
export default function App() {
  const viewportRef = useRef<ViewportHandle | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const [currentView, setCurrentView] = useState<CameraViewId>(DEFAULT_CAMERA_VIEW_ID);

  const onViewportReady = useCallback((handle: ViewportHandle | null) => {
    viewportRef.current = handle;
    setViewportReady(handle !== null);
  }, []);

  const selectView = useCallback((viewId: CameraViewId) => {
    viewportRef.current?.setView(viewId);
    setCurrentView(viewId);
  }, []);

  const fit = useCallback(() => {
    viewportRef.current?.fit();
    setCurrentView(DEFAULT_CAMERA_VIEW_ID);
  }, []);

  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <ViewControls
          currentView={currentView}
          onSelectView={selectView}
          onZoomIn={() => viewportRef.current?.zoomIn()}
          onZoomOut={() => viewportRef.current?.zoomOut()}
          onFit={fit}
          disabled={!viewportReady}
        />
        <div className="viewport-wrap">
          <Viewport onReady={onViewportReady} />
        </div>
        <ShapesPanel />
      </main>
    </div>
  );
}

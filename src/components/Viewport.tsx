import { useEffect, useRef } from 'react';
import { createViewport } from '../three/viewport';
import type { ViewportDesignCallbacks, ViewportHandle } from '../three/viewport';

/**
 * The 3D viewport. React owns only the container div and the mount /
 * unmount lifecycle; all Three.js work lives in `src/three/viewport.ts`.
 * `onReady` hands the imperative viewport handle up to the App so the
 * view controls can call it; React never holds Three.js objects itself.
 * `designCallbacks` (Milestone 3) reports piece clicks, drags, and
 * empty-space clicks back to the App as plain data.
 */
export default function Viewport({
  onReady,
  designCallbacks,
}: {
  onReady: (handle: ViewportHandle | null) => void;
  designCallbacks?: ViewportDesignCallbacks;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const viewport = createViewport(container, designCallbacks);
    onReady(viewport);
    return () => {
      onReady(null);
      viewport.dispose();
    };
  }, [onReady, designCallbacks]);

  return (
    <div className="viewport" ref={containerRef} role="region" aria-label="3D workplane">
      <p className="viewport-note">
        Workplane · 1,000 × 1,000 mm — drag to orbit, scroll to zoom. Click Place in the Shapes
        panel to put a piece down, then drag the piece to move it. In Rotate mode, drag a curved
        arrow handle (red X, green Y, blue Z) to turn the piece.
      </p>
    </div>
  );
}

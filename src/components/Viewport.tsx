import { useEffect, useRef } from 'react';
import { createViewport } from '../three/viewport';
import type { ViewportHandle } from '../three/viewport';

/**
 * The 3D viewport. React owns only the container div and the mount /
 * unmount lifecycle; all Three.js work lives in `src/three/viewport.ts`.
 * The overlay note marks this as the empty placeholder from Milestone 0
 * — the workplane grid is live (orbit / zoom work), but there are no
 * pieces yet. It is removed when the piece library lands in Milestone 2.
 * `onReady` hands the imperative viewport handle up to the App so the
 * view controls can call it; React never holds Three.js objects itself.
 */
export default function Viewport({
  onReady,
}: {
  onReady: (handle: ViewportHandle | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const viewport = createViewport(container);
    onReady(viewport);
    return () => {
      onReady(null);
      viewport.dispose();
    };
  }, [onReady]);

  return (
    <div className="viewport" ref={containerRef} role="region" aria-label="3D workplane">
      <p className="viewport-note">
        Workplane · 1,000 × 1,000 mm — drag to orbit, scroll to zoom. Import a piece in the Shapes
        panel to place it (Milestone 3).
      </p>
    </div>
  );
}

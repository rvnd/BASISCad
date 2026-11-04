import { useEffect, useRef } from 'react';
import { createViewport } from '../three/viewport';

/**
 * The 3D viewport. React owns only the container div and the mount /
 * unmount lifecycle; all Three.js work lives in `src/three/viewport.ts`.
 * The overlay note marks this as the empty placeholder from Milestone 0
 * — the workplane grid is live (orbit / zoom work), but there are no
 * pieces yet. It is removed when the piece library lands in Milestone 2.
 */
export default function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const viewport = createViewport(container);
    return () => {
      viewport.dispose();
    };
  }, []);

  return (
    <div className="viewport" ref={containerRef} role="region" aria-label="3D workplane">
      <p className="viewport-note">
        Workplane · 1,000 × 1,000 mm — drag to orbit, scroll to zoom. Pieces arrive in Milestone 2.
      </p>
    </div>
  );
}

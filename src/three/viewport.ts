import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFramingCamera, createWorkplane } from './workplane';

/**
 * Imperative Three.js viewport, kept deliberately separate from React.
 *
 * React (`src/components/Viewport.tsx`) only owns mount/unmount: it calls
 * `createViewport` once the container div exists and calls `dispose()` on
 * cleanup. Everything that touches the renderer, scene, camera, controls,
 * animation loop, and resize handling lives here, so later milestones can
 * grow the scene (pieces, selection, snapping) without touching React,
 * and React can re-render the surrounding UI without disturbing the 3D
 * view. This also keeps StrictMode's double-mount in dev safe: create and
 * dispose are a matched pair with no shared state.
 */

export interface ViewportHandle {
  dispose(): void;
}

function disposeObject(object: THREE.Object3D): void {
  if (object instanceof THREE.Mesh) {
    object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        entry.dispose();
      }
    } else {
      material.dispose();
    }
  }
}

export function createViewport(container: HTMLElement): ViewportHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', '3D workplane');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.add(createWorkplane());

  const camera = createFramingCamera(1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  // Never orbit below the workplane.
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 100;
  controls.maxDistance = 4000;
  controls.update();

  const resize = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  let disposed = false;
  let animationFrame = 0;
  const tick = (): void => {
    if (disposed) {
      return;
    }
    animationFrame = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  return {
    dispose(): void {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.dispose();
      scene.traverse(disposeObject);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

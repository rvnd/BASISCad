import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getCameraView } from './cameraViews';
import type { CameraViewId } from './cameraViews';
import { createDesignScene } from './designScene';
import type { PlacedPiece, RotationDeg, SelectionMode } from '../app/design';
import { normalizeAngleDeg, snapDeltaDeg } from '../app/rotation';
import type { LibraryPiece } from '../app/library';
import { createFramingCamera, createWorkplane } from './workplane';
import { eventToNdc, pointerToWorkplane } from './pointer';
import { RING_ANGLE_SIGNS, unwrapAngleDelta } from './rotationRings';
import type { RotationAxis } from './rotationRings';

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
  /** Move the camera to a named view (Top / Front / … / 3D), looking at the workplane centre. */
  setView(viewId: CameraViewId): void;
  /** Dolly the camera closer along its current direction. */
  zoomIn(): void;
  /** Dolly the camera farther away along its current direction. */
  zoomOut(): void;
  /** Back to the Milestone 0 framing: the (1, 1, 1) diagonal, whole workplane in view. */
  fit(): void;
  /** Render the placed pieces from App state (Milestone 3). */
  syncDesign(
    placed: readonly PlacedPiece[],
    library: readonly LibraryPiece[],
    selectedIds: readonly string[],
  ): void;
  /** What dragging a selected piece does (Milestone 4). */
  setSelectionMode(mode: SelectionMode): void;
  /** The quick-rotate step ring drags snap to (Milestone 4 fix). */
  setRotateStep(step: number): void;
}

/**
 * What the viewport reports back when the user acts on a piece. All
 * values are plain data — App decides what they mean for its state.
 * A drag reports the workplane point the pointer is over, offset by
 * where the piece was grabbed, so the piece follows the pointer
 * instead of jumping so its centre is under the cursor.
 */
export interface ViewportDesignCallbacks {
  onSelectPiece(placedId: string, additive: boolean): void;
  onDeselectAll(): void;
  onDragPiece(placedId: string, x: number, z: number): void;
  /** A ring drag or rotate-mode drag set one axis to an absolute angle. */
  onRotatePiece(placedId: string, axis: RotationAxis, angleDeg: number): void;
  /** Grabbing a rotation ring switches the selection to Rotate mode. */
  onBeginRotate(placedId: string): void;
  /** The pointer hovers a rotation ring (Rotate mode only), or none. */
  onRingHover(axis: RotationAxis | null): void;
}

/** Zoom step: each click moves the camera 20% closer / farther. */
const ZOOM_FACTOR = 0.8;

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

export function createViewport(
  container: HTMLElement,
  designCallbacks?: ViewportDesignCallbacks,
): ViewportHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', '3D workplane');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.add(createWorkplane());

  // Lights for the standard-material pieces (Milestone 2 onwards).
  // The workplane itself uses basic materials and is unaffected.
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(400, 800, 500);
  scene.add(directional);

  const camera = createFramingCamera(1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  // Never orbit below the workplane.
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 100;
  controls.maxDistance = 4000;
  controls.update();

  // Placed pieces (Milestone 3): the design scene owns their meshes.
  const designScene = createDesignScene(scene);

  // Pointer interaction with pieces. A pointer-down on a piece takes
  // over the gesture (OrbitControls is disabled for it): a release
  // without moving selects the piece, moving drags it across the
  // workplane. A pointer-down on empty space leaves orbit alone; a
  // release without moving deselects everything. Clicks are told apart
  // from drags by a few pixels of movement.
  //
  // Milestone 4 adds two rotate gestures, both Rotate-mode only.
  // Grabbing a rotation ring rotates the piece about that ring's
  // axis, following the pointer around the ring and snapping to the
  // panel's step (hold Alt to drag freely); in Rotate mode, dragging
  // the piece itself turns it around the vertical (Y) axis. Both
  // report absolute angles, so the App stays the single source of
  // truth for rotation. In Move mode the rings are hidden, so a ring
  // grab can never accidentally rotate a piece being moved. Hovering
  // a ring highlights it, shows a grab cursor, and names its axis in
  // the panel.
  const CLICK_SLOP_PX = 4;
  /** Degrees of Y rotation per pixel of horizontal drag in Rotate mode. */
  const ROTATE_DRAG_DEGREES_PER_PX = 0.5;
  let selectionMode: SelectionMode = 'move';
  /** The panel's quick-rotate step; ring drags snap to it (Alt drags freely). */
  let rotateStep = 45;
  /** The ring the pointer currently hovers, if any — for highlight + cursor. */
  let hoveredRing: RotationAxis | null = null;
  let downAt: { x: number; y: number } | null = null;
  type Gesture =
    | { kind: 'move'; placedId: string; grabOffset: { x: number; z: number } }
    | {
        kind: 'ring';
        placedId: string;
        axis: RotationAxis;
        startAngleDeg: number;
        startRotationDeg: number;
        lastAngleDeg: number;
        totalDeltaDeg: number;
      }
    | { kind: 'rotate'; placedId: string; startClientX: number; startRotationDeg: number };
  let gesture: Gesture | null = null;
  let moved = false;

  /**
   * Hover feedback for the rotation rings: highlight the ring under
   * the pointer, switch the cursor to a grab hand, and tell React
   * which axis is hovered so the panel can name it. Runs only when
   * no drag gesture is in progress.
   */
  const updateRingHover = (event: PointerEvent): void => {
    if (designCallbacks === undefined) {
      return;
    }
    const ndc = eventToNdc(event, renderer.domElement);
    const hovered = designScene.ringHit(ndc.x, ndc.y, camera)?.axis ?? null;
    if (hovered !== hoveredRing) {
      hoveredRing = hovered;
      designScene.setRingHover(hovered);
      designCallbacks.onRingHover(hovered);
    }
    renderer.domElement.style.cursor = hovered === null ? '' : 'grab';
  };

  const clearRingHover = (): void => {
    if (hoveredRing !== null) {
      hoveredRing = null;
      designScene.setRingHover(null);
      designCallbacks?.onRingHover(null);
    }
    renderer.domElement.style.cursor = '';
  };

  const endPointerGesture = (event: PointerEvent): void => {
    if (gesture !== null) {
      controls.enabled = true;
      if (!moved && designCallbacks !== undefined && gesture.kind !== 'ring') {
        designCallbacks.onSelectPiece(gesture.placedId, event.shiftKey);
      }
      gesture = null;
    } else if (downAt !== null && !moved && designCallbacks !== undefined) {
      designCallbacks.onDeselectAll();
    }
    downAt = null;
    moved = false;
    clearRingHover();
  };

  const onPointerDown = (event: PointerEvent): void => {
    downAt = { x: event.clientX, y: event.clientY };
    moved = false;
    gesture = null;
    if (designCallbacks === undefined) {
      return;
    }
    const ndc = eventToNdc(event, renderer.domElement);
    // Rotation rings first: grabbing one switches to Rotate mode.
    const ring = designScene.ringHit(ndc.x, ndc.y, camera);
    if (ring !== null) {
      const rotation: RotationDeg | null = designScene.rotationOf(ring.placedId);
      if (rotation !== null) {
        gesture = {
          kind: 'ring',
          placedId: ring.placedId,
          axis: ring.axis,
          startAngleDeg: ring.angleDeg,
          startRotationDeg: rotation[ring.axis],
          lastAngleDeg: ring.angleDeg,
          totalDeltaDeg: 0,
        };
        controls.enabled = false;
        renderer.domElement.style.cursor = 'grabbing';
        designCallbacks.onBeginRotate(ring.placedId);
        try {
          renderer.domElement.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort; the gesture still works.
        }
      }
      return;
    }
    const hit = designScene.pick(ndc.x, ndc.y, camera);
    if (hit === null) {
      return;
    }
    if (selectionMode === 'rotate') {
      const rotation: RotationDeg | null = designScene.rotationOf(hit);
      gesture = {
        kind: 'rotate',
        placedId: hit,
        startClientX: event.clientX,
        startRotationDeg: rotation === null ? 0 : rotation.y,
      };
      controls.enabled = false;
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort; the gesture still works.
      }
      return;
    }
    const point = pointerToWorkplane(ndc.x, ndc.y, camera);
    const centre = designScene.positionOf(hit);
    if (point === null || centre === null) {
      return;
    }
    gesture = {
      kind: 'move',
      placedId: hit,
      grabOffset: { x: centre.x - point.x, z: centre.z - point.z },
    };
    controls.enabled = false;
    try {
      renderer.domElement.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; the gesture still works.
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (downAt !== null) {
      const movedPx = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
      if (movedPx > CLICK_SLOP_PX) {
        moved = true;
      }
    }
    if (gesture === null) {
      updateRingHover(event);
      return;
    }
    if (!moved || designCallbacks === undefined) {
      return;
    }
    if (gesture.kind === 'ring') {
      const ndc = eventToNdc(event, renderer.domElement);
      const angle = designScene.ringAngle(gesture.axis, ndc.x, ndc.y, camera);
      if (angle === null) {
        return;
      }
      gesture.totalDeltaDeg += unwrapAngleDelta(gesture.lastAngleDeg, angle);
      gesture.lastAngleDeg = angle;
      // Ring drags snap to the panel's step, from where the drag
      // started; holding Alt drags freely without snapping.
      const rawDelta = gesture.totalDeltaDeg * RING_ANGLE_SIGNS[gesture.axis];
      const snappedDelta = event.altKey ? rawDelta : snapDeltaDeg(rawDelta, rotateStep);
      designCallbacks.onRotatePiece(
        gesture.placedId,
        gesture.axis,
        normalizeAngleDeg(gesture.startRotationDeg + snappedDelta),
      );
      return;
    }
    if (gesture.kind === 'rotate') {
      designCallbacks.onRotatePiece(
        gesture.placedId,
        'y',
        normalizeAngleDeg(
          gesture.startRotationDeg +
            (event.clientX - gesture.startClientX) * ROTATE_DRAG_DEGREES_PER_PX,
        ),
      );
      return;
    }
    const ndc = eventToNdc(event, renderer.domElement);
    const point = pointerToWorkplane(ndc.x, ndc.y, camera);
    if (point === null) {
      return;
    }
    designCallbacks.onDragPiece(
      gesture.placedId,
      point.x + gesture.grabOffset.x,
      point.z + gesture.grabOffset.z,
    );
  };

  const onPointerUp = (event: PointerEvent): void => {
    endPointerGesture(event);
  };

  const onPointerCancel = (): void => {
    // A cancelled gesture never counts as a click.
    if (gesture !== null) {
      controls.enabled = true;
    }
    gesture = null;
    downAt = null;
    moved = false;
    clearRingHover();
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerCancel);

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

  /**
   * Dolly along the camera's current direction, clamped to the
   * OrbitControls distance limits and to the polar-angle limit, so the
   * camera can never go below the workplane or inside the plane.
   */
  const dolly = (factor: number): void => {
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.radius = THREE.MathUtils.clamp(
      spherical.radius * factor,
      controls.minDistance,
      controls.maxDistance,
    );
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0, controls.maxPolarAngle);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
  };

  const applyView = (viewId: CameraViewId): void => {
    const view = getCameraView(viewId);
    if (view === undefined) {
      return;
    }
    camera.position.set(view.position[0], view.position[1], view.position[2]);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  return {
    setView(viewId: CameraViewId): void {
      applyView(viewId);
    },
    zoomIn(): void {
      dolly(ZOOM_FACTOR);
    },
    zoomOut(): void {
      dolly(1 / ZOOM_FACTOR);
    },
    fit(): void {
      applyView('3d');
    },
    syncDesign(
      placed: readonly PlacedPiece[],
      library: readonly LibraryPiece[],
      selectedIds: readonly string[],
    ): void {
      designScene.sync(placed, library, selectedIds);
    },
    setSelectionMode(mode: SelectionMode): void {
      selectionMode = mode;
      // Rings only show in Rotate mode — in Move mode a ring grab
      // would silently rotate a piece the user was trying to move.
      designScene.setRingsEnabled(mode === 'rotate');
    },
    setRotateStep(step: number): void {
      rotateStep = step;
    },
    dispose(): void {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      controls.dispose();
      designScene.dispose();
      scene.traverse(disposeObject);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

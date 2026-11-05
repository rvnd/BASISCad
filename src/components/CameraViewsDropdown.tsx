import { useEffect, useRef, useState } from 'react';
import { CAMERA_VIEWS, DEFAULT_CAMERA_VIEW_ID, getCameraView } from '../three/cameraViews';
import type { CameraViewId } from '../three/cameraViews';

/**
 * Camera-views dropdown. Closed by default, showing the current view.
 *
 * The expanded list is the same width as the collapsed button (the list
 * is absolutely positioned inside a relative wrapper of the button's
 * width) and its items are the same size as the button, so opening it
 * never pushes other layout around. Clicking a view switches the camera
 * immediately and closes the list. Clicking outside — or pressing
 * Escape — closes it without changing the view. This dropdown did not
 * expand at all in the ChatGPT prototype; that is why its behaviour is
 * spelled out here instead of assumed.
 */

interface CameraViewsDropdownProps {
  /** The view currently shown, e.g. '3d'. */
  currentView: CameraViewId;
  /** Called when the user picks a view; the parent switches the camera. */
  onSelectView: (viewId: CameraViewId) => void;
  /** True once the 3D viewport exists, so switching can actually happen. */
  disabled: boolean;
}

export default function CameraViewsDropdown({
  currentView,
  onSelectView,
  disabled,
}: CameraViewsDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const currentLabel =
    getCameraView(currentView)?.label ?? getCameraView(DEFAULT_CAMERA_VIEW_ID)?.label;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      if (wrapperRef.current !== null && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="camera-views" ref={wrapperRef}>
      <button
        type="button"
        className="control-button camera-views-toggle"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Camera view: ${currentLabel ?? '3D'}. Activate to choose a view.`}
        disabled={disabled}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen);
        }}
      >
        <span>{currentLabel}</span>
        <span className="camera-views-chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ul className="camera-views-list" role="menu" aria-label="Camera views">
          {CAMERA_VIEWS.map((view) => (
            <li key={view.id} role="none">
              <button
                type="button"
                role="menuitem"
                className="control-button camera-views-item"
                aria-current={view.id === currentView}
                onClick={() => {
                  onSelectView(view.id);
                  setOpen(false);
                }}
              >
                {view.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

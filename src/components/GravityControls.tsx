import { useEffect, useRef, useState } from 'react';
import type { GravityStatus, GravitySummary } from '../app/gravity';
import { GRAVITY_PRESETS } from '../app/gravity';
import { MATERIAL, MATERIAL_INFILL_PERCENT } from '../app/constants';

export function TestMenu({ disabled, onGravity }: { disabled: boolean; onGravity: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, []);
  return (
    <div className="test-menu" ref={ref}>
      <button
        type="button"
        className="assembly-tool"
        aria-label="Tests"
        title="Test the design"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3h6M10 3v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3M7 15h10" />
        </svg>
      </button>
      {open && (
        <div className="test-menu-options" role="menu" aria-label="Tests">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onGravity();
            }}
          >
            Gravity
          </button>
        </div>
      )}
    </div>
  );
}

export default function GravityControls({
  status,
  acceleration,
  seconds,
  summary,
  error,
  onAcceleration,
  onStart,
  onPause,
  onResume,
  onReset,
  onClose,
}: {
  status: GravityStatus;
  acceleration: number;
  seconds: number;
  summary: GravitySummary | null;
  error: string | null;
  onAcceleration: (value: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <section className="gravity-panel" aria-label="Gravity test">
      <div className="dialog-heading">
        <h2>Gravity</h2>
        <button
          type="button"
          className="dialog-close"
          aria-label="Close gravity test"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="panel-note">
        Test falling, support, sliding and tipping. Testing preserves your starting design.
      </p>
      <p className="panel-note">
        Supported pieces may stay still. To try a fall, close this panel and increase a piece’s Y
        height before starting.
      </p>
      <div className="gravity-presets" role="group" aria-label="Gravity presets">
        {GRAVITY_PRESETS.map((p) => (
          <button
            type="button"
            key={p.name}
            aria-pressed={acceleration === p.acceleration}
            onClick={() => onAcceleration(p.acceleration)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <label className="gravity-slider">
        Gravity strength: {acceleration.toFixed(2)} m/s²
        <input
          aria-label="Gravity strength"
          type="range"
          min="0"
          max="20"
          step="0.01"
          value={acceleration}
          onChange={(e) => onAcceleration(Number(e.target.value))}
        />
      </label>
      <p role="status" aria-label="Simulation status">
        {status === 'idle'
          ? 'Ready to test'
          : status === 'loading'
            ? 'Preparing gravity…'
            : status === 'running'
              ? 'Running'
              : status === 'paused'
                ? 'Paused'
                : status === 'settled'
                  ? 'Settled'
                  : 'Could not run gravity'}{' '}
        · {seconds.toFixed(1)} s
      </p>
      {summary && (
        <p className="panel-note">
          {summary.bodies} physical {summary.bodies === 1 ? 'body' : 'bodies'} · {summary.hinges}{' '}
          {summary.hinges === 1 ? 'hinge' : 'hinges'} · estimated mass{' '}
          {summary.massGrams.toFixed(1)} g
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="gravity-actions">
        {(status === 'idle' || status === 'error') && (
          <button type="button" className="dialog-primary" onClick={onStart}>
            Start gravity
          </button>
        )}
        {status === 'running' && (
          <button type="button" onClick={onPause}>
            Pause
          </button>
        )}
        {(status === 'paused' || status === 'settled') && (
          <button type="button" onClick={onResume}>
            Resume
          </button>
        )}
        <button type="button" onClick={onReset}>
          Reset design
        </button>
      </div>
      <p className="panel-note">
        Orbit or zoom to inspect. Reset restores the exact starting design. Tests pause after 30
        seconds.
      </p>
      <p className="panel-note">
        Elapsed time is simulated time. Large active designs can play more slowly.
      </p>
      <p className="panel-note">
        Bending and breaking are not simulated; breaking loads are not calibrated.
      </p>
      <details>
        <summary>Assumptions and limits</summary>
        <p className="panel-note">
          {MATERIAL}, {MATERIAL_INFILL_PERCENT}% infill with estimated 0.8 mm walls and skins.
          Masses and friction are approximate. Two separated screws fix a joint; one screw can
          hinge. Groups and edit locks do not anchor pieces. A floor one metre below the workplane
          catches falling pieces.
        </p>
        <p className="panel-note">
          Shows support and motion. Does not predict bending or breaking. Breaking loads are not
          calibrated for these printed parts.
        </p>
      </details>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { ConnectionOptions } from '../three/connectPieces';

export default function ConnectControls({
  active,
  disabled,
  options,
  canRetry,
  onToggle,
  onOptions,
  onRetry,
}: {
  active: boolean;
  disabled: boolean;
  options: ConnectionOptions;
  canRetry: boolean;
  onToggle: () => void;
  onOptions: (options: ConnectionOptions) => void;
  onRetry: (bestFit: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="connect-controls" ref={ref}>
      <button
        type="button"
        className="tool-button"
        disabled={disabled}
        aria-pressed={active}
        onClick={onToggle}
        title="Pick two holes to join pieces"
      >
        Connect
      </button>
      <button
        type="button"
        className="tool-button"
        aria-label="Connection options"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⌄
      </button>
      {open && (
        <div className="connection-options" aria-label="Connection options">
          {(
            [
              { key: 'eitherSide', label: 'Try either side' },
              { key: 'moreAngles', label: 'Try more angles' },
              { key: 'moveAssembly', label: 'Allow moving the connected assembly' },
            ] as const
          ).map(({ key, label }) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(event) => onOptions({ ...options, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
          <button
            type="button"
            disabled={!canRetry}
            onClick={() => {
              setOpen(false);
              onRetry(false);
            }}
          >
            Retry the same holes
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onRetry(true);
            }}
          >
            Try best fit
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { PRINT_VIEWS } from '../app/printViews';
import type { PrintView } from '../three/printSnapshot';
export default function PrintViewDialog({
  onClose,
  onPreview,
  error,
  busy,
}: {
  onClose: () => void;
  onPreview: (view: PrintView) => void;
  error: string | null;
  busy: boolean;
}) {
  const [view, setView] = useState<PrintView | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="dialog-backdrop">
      <section className="project-dialog" role="dialog" aria-modal="true" aria-label="Print Design">
        <h2>Print Design</h2>
        <p>Choose the view for the design page.</p>
        <div className="print-view-options">
          {PRINT_VIEWS.map((option) => (
            <label key={option.id}>
              <input
                type="radio"
                name="print-view"
                checked={view === option.id}
                onChange={() => setView(option.id)}
              />
              {option.name}
            </label>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-primary"
            disabled={!view || busy}
            onClick={() => {
              if (view) onPreview(view);
            }}
          >
            {busy ? 'Preparing…' : 'Preview'}
          </button>
        </div>
      </section>
    </div>
  );
}

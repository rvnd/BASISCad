import { useRef } from 'react';
import type { TabletAction } from '../app/tabletControls';

export default function TabletControls({
  action,
  disabled,
  onHold,
}: {
  action: TabletAction | null;
  disabled: boolean;
  onHold: (action: TabletAction | null) => void;
}) {
  const pointer = useRef<number | null>(null);
  return (
    <section className="tablet-controls" role="region" aria-label="Tablet axis controls">
      <p>Hold an axis here, then drag the workplane with your other hand.</p>
      <div className="tablet-axis-buttons">
        {(['move', 'rotate'] as const).flatMap((kind) =>
          (['x', 'y', 'z'] as const).map((axis) => (
            <button
              key={`${kind}-${axis}`}
              type="button"
              disabled={disabled}
              aria-pressed={action?.kind === kind && action.axis === axis}
              onPointerDown={(event) => {
                if (event.pointerType !== 'touch' || pointer.current !== null) return;
                event.preventDefault();
                event.stopPropagation();
                pointer.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                onHold({ kind, axis });
              }}
              onPointerUp={(event) => {
                if (event.pointerId !== pointer.current) return;
                pointer.current = null;
                onHold(null);
              }}
              onPointerCancel={() => {
                pointer.current = null;
                onHold(null);
              }}
              onLostPointerCapture={() => {
                pointer.current = null;
                onHold(null);
              }}
            >
              {kind === 'move' ? 'Move' : 'Rotate'} {axis.toUpperCase()}
            </button>
          )),
        )}
      </div>
    </section>
  );
}

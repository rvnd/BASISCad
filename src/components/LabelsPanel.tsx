import { useState } from 'react';
import type { LabelMode } from '../app/labels';

interface LabelsPanelProps {
  mode: LabelMode;
  move: boolean;
  pieces: readonly { id: string; name: string; hidden: boolean }[];
  onMode: (mode: LabelMode) => void;
  onMove: (enabled: boolean) => void;
  onVisible: (id: string, visible: boolean) => void;
  onReset: () => void;
}
export default function LabelsPanel(props: LabelsPanelProps) {
  const [collapsed, setCollapsed] = useState(true),
    [info, setInfo] = useState(false);
  return (
    <section className="panel labels-panel" aria-label="Labels">
      <div className="panel-header-row">
        <h2 className="panel-title">Labels</h2>
        <button
          className="panel-collapse"
          type="button"
          aria-label={collapsed ? 'Expand Labels' : 'Collapse Labels'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="label-modes" role="group" aria-label="Label mode">
            {(
              [
                ['off', 'Off'],
                ['names', 'Piece Names'],
                ['measurements', 'Measurements'],
              ] as const
            ).map(([value, name]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="label-mode"
                  checked={props.mode === value}
                  onChange={() => props.onMode(value)}
                />
                {name}
              </label>
            ))}
          </div>
          <div className="label-move-setting">
            <label>
              <input
                type="checkbox"
                checked={props.move}
                onChange={(e) => props.onMove(e.currentTarget.checked)}
              />{' '}
              Enable Move labels
            </label>
            <button
              type="button"
              className="label-info"
              aria-label="About moving labels"
              aria-expanded={info}
              onClick={() => setInfo(!info)}
            >
              i
            </button>
          </div>
          {info && (
            <p className="panel-note">
              Drag a label to move it without moving its piece. Use the checkboxes to show or hide
              individual labels. Positions and visibility are saved with this design; Reset labels
              restores all of them. Labels follow their pieces, including when you orbit or zoom.
            </p>
          )}
          <button
            type="button"
            className="control-button"
            disabled={!props.pieces.length}
            onClick={props.onReset}
          >
            Reset labels
          </button>
          {props.mode !== 'off' && (
            <div className="label-visibility" role="group" aria-label="Show piece labels">
              {props.pieces.map((piece, i) => (
                <label key={piece.id}>
                  <input
                    type="checkbox"
                    aria-label={`Show label for ${piece.name} (piece ${i + 1})`}
                    checked={!piece.hidden}
                    onChange={(e) => props.onVisible(piece.id, e.currentTarget.checked)}
                  />
                  <span>
                    {piece.name} ({i + 1})
                  </span>
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

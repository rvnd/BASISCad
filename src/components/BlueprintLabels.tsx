import { useRef } from 'react';
import type { PointerEvent } from 'react';
import type { BlueprintLabel, ScreenPoint } from '../three/blueprintLabels';

interface BlueprintLabelsProps {
  labels: readonly BlueprintLabel[];
  move: boolean;
  onBegin: () => void;
  onEnd: () => void;
  onMove: (id: string, offset: ScreenPoint) => void;
}
export default function BlueprintLabels(props: BlueprintLabelsProps) {
  const drag = useRef<{ id: string; start: ScreenPoint; offset: ScreenPoint } | null>(null);
  const events = (label: BlueprintLabel) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!props.move) return;
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: label.id, start: { x: e.clientX, y: e.clientY }, offset: label.offset };
      props.onBegin();
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!drag.current || drag.current.id !== label.id) return;
      e.stopPropagation();
      props.onMove(label.id, {
        x: drag.current.offset.x + e.clientX - drag.current.start.x,
        y: drag.current.offset.y + e.clientY - drag.current.start.y,
      });
    },
    onPointerUp: () => {
      if (drag.current) {
        drag.current = null;
        props.onEnd();
      }
    },
    onPointerCancel: () => {
      if (drag.current) {
        drag.current = null;
        props.onEnd();
      }
    },
  });
  const Tag = props.move ? 'button' : 'span';
  return (
    <div
      className={`blueprint-overlay${props.move ? ' blueprint-move' : ''}`}
      aria-label="Blueprint labels"
    >
      <svg className="blueprint-lines" aria-hidden="true">
        <defs>
          <marker
            id="dimension-arrow"
            viewBox="0 0 8 8"
            refX="4"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0L8 4L0 8z" fill="#333" />
          </marker>
        </defs>
        {props.labels.map((label) =>
          label.dimensions.length ? (
            label.dimensions.map((dimension, i) => (
              <g key={`${label.id}-${i}`}>
                <line
                  x1={dimension.fromStart.x}
                  y1={dimension.fromStart.y}
                  x2={dimension.start.x}
                  y2={dimension.start.y}
                />
                <line
                  x1={dimension.fromEnd.x}
                  y1={dimension.fromEnd.y}
                  x2={dimension.end.x}
                  y2={dimension.end.y}
                />
                <line
                  className="dimension-line"
                  markerStart="url(#dimension-arrow)"
                  markerEnd="url(#dimension-arrow)"
                  x1={dimension.start.x}
                  y1={dimension.start.y}
                  x2={dimension.end.x}
                  y2={dimension.end.y}
                />
                <line
                  className="dimension-text-leader"
                  x1={(dimension.start.x + dimension.end.x) / 2}
                  y1={(dimension.start.y + dimension.end.y) / 2}
                  x2={dimension.textAt.x}
                  y2={dimension.textAt.y}
                />
              </g>
            ))
          ) : (
            <line
              key={label.id}
              x1={label.anchor.x}
              y1={label.anchor.y}
              x2={label.position.x}
              y2={label.position.y}
            />
          ),
        )}
      </svg>
      {props.labels.map((label) =>
        label.dimensions.length ? (
          label.dimensions.map((dimension, i) => (
            <Tag
              key={`${label.id}-${i}`}
              className="blueprint-label dimension-label"
              data-piece-id={label.id}
              aria-label={`${label.name}: ${dimension.text}`}
              style={{ left: dimension.textAt.x, top: dimension.textAt.y }}
              {...events(label)}
            >
              {dimension.text}
            </Tag>
          ))
        ) : (
          <Tag
            key={label.id}
            className="blueprint-label name-label"
            data-piece-id={label.id}
            style={{ left: label.position.x, top: label.position.y }}
            {...events(label)}
          >
            {label.name}
          </Tag>
        ),
      )}
    </div>
  );
}

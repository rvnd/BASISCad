import type { HoleTarget } from '../three/connectionHoles';
import type { HoleRef } from '../app/connections';
import { sameHole } from '../app/connections';

export default function HolePicker({
  targets,
  first,
  onPick,
}: {
  targets: readonly HoleTarget[];
  first: readonly HoleRef[] | null;
  onPick: (members: readonly HoleRef[]) => void;
}) {
  return (
    <div className="hole-picker" aria-label="Pick connection holes">
      <p className="connection-hint">
        {first ? 'Pick the hole to join.' : 'Pick a hole on the piece to move.'}{' '}
        <span>Esc to cancel</span>
      </p>
      <svg className="hole-leaders" aria-hidden="true">
        {targets.map((target) => (
          <line
            key={target.id}
            x1={target.anchorX}
            y1={target.anchorY}
            x2={target.x}
            y2={target.y}
          />
        ))}
      </svg>
      {targets.map((target) => (
        <button
          key={target.id}
          type="button"
          className={`hole-target${target.occupied ? ' occupied' : ''}`}
          style={{ left: target.x, top: target.y }}
          aria-label={target.title}
          title={target.title}
          aria-pressed={first?.some((a) => target.members.some((b) => sameHole(a, b))) ?? false}
          onClick={() => onPick(target.members)}
        />
      ))}
    </div>
  );
}

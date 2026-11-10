interface AssemblyControlsProps {
  canGroup: boolean;
  canUngroup: boolean;
  canLock: boolean;
  locked: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onLock: () => void;
}

export default function AssemblyControls(props: AssemblyControlsProps) {
  return (
    <div className="assembly-controls" role="group" aria-label="Assembly tools">
      <button
        type="button"
        className="assembly-tool"
        aria-label="Group"
        title="Group selection"
        disabled={!props.canGroup}
        onClick={props.onGroup}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" />
          <path d="M7 7h6v6H7zM11 11h6v6h-6z" />
        </svg>
      </button>
      <button
        type="button"
        className="assembly-tool"
        aria-label="Ungroup"
        title="Ungroup selection"
        disabled={!props.canUngroup}
        onClick={props.onUngroup}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 3h7v7H3zM14 14h7v7h-7zM14 7h7M17 4l4 3-4 3M3 17h7M7 14l-4 3 4 3" />
        </svg>
      </button>
      <button
        type="button"
        className="assembly-tool"
        aria-label={props.locked ? 'Unlock' : 'Lock'}
        title={props.locked ? 'Unlock selection' : 'Lock selection'}
        disabled={!props.canLock}
        onClick={props.onLock}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d={props.locked ? 'M8 10V7a4 4 0 0 1 8 0v3' : 'M8 10V7a4 4 0 0 1 8 0M12 14v3'} />
        </svg>
      </button>
    </div>
  );
}

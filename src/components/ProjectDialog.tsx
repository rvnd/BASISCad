import { useEffect, useRef, useState } from 'react';
import type { DesignDocument } from '../app/projects';

export type ProjectDialogMode = 'new' | 'rename' | 'open' | 'manage' | 'recovery';

interface ProjectDialogProps {
  mode: ProjectDialogMode;
  currentName: string;
  projects: readonly DesignDocument[];
  recovery: DesignDocument | null;
  canClose: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
  onOpen: (design: DesignDocument) => void;
  onDelete: (id: string) => void;
  onRestore: () => void;
  onDiscardRecovery: () => void;
  onShowOpen: () => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export default function ProjectDialog({
  mode,
  currentName,
  projects,
  recovery,
  canClose,
  onClose,
  onCreate,
  onRename,
  onOpen,
  onDelete,
  onRestore,
  onDiscardRecovery,
  onShowOpen,
}: ProjectDialogProps) {
  const [name, setName] = useState(mode === 'rename' ? currentName : '');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'new' || mode === 'rename') {
      inputRef.current?.focus();
    }
  }, [mode]);

  const title =
    mode === 'new'
      ? 'New Design'
      : mode === 'rename'
        ? 'Rename Design'
        : mode === 'open'
          ? 'Open Design'
          : mode === 'manage'
            ? 'Manage Projects'
            : 'Recover Design';

  return (
    <div className="dialog-backdrop">
      <section
        className="project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
      >
        <div className="dialog-heading">
          <h2 id="project-dialog-title">{title}</h2>
          {canClose && (
            <button
              type="button"
              className="dialog-close"
              aria-label="Close dialog"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>

        {(mode === 'new' || mode === 'rename') && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = name.trim();
              if (trimmed.length === 0) {
                return;
              }
              if (mode === 'new') {
                onCreate(trimmed);
              } else {
                onRename(trimmed);
              }
            }}
          >
            <label className="dialog-label" htmlFor="design-name-input">
              Design name
            </label>
            <input
              ref={inputRef}
              id="design-name-input"
              className="dialog-input"
              type="text"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <div className="dialog-actions">
              {mode === 'new' && projects.length > 0 && (
                <button type="button" className="dialog-secondary" onClick={onShowOpen}>
                  Open saved design
                </button>
              )}
              {canClose && (
                <button type="button" className="dialog-secondary" onClick={onClose}>
                  Cancel
                </button>
              )}
              <button type="submit" className="dialog-primary" disabled={name.trim().length === 0}>
                {mode === 'new' ? 'Start Design' : 'Save Name'}
              </button>
            </div>
          </form>
        )}

        {mode === 'open' && (
          <>
            {projects.length === 0 ? (
              <p className="panel-note">No designs have been saved on this device yet.</p>
            ) : (
              <ul className="project-list">
                {projects.map((project) => (
                  <li className="project-row" key={project.id}>
                    <div className="project-row-copy">
                      <strong>{project.name}</strong>
                      <span>{formatDate(project.updatedAt)}</span>
                    </div>
                    <button
                      type="button"
                      className="dialog-primary"
                      aria-label={`Open ${project.name}`}
                      onClick={() => onOpen(project)}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="dialog-actions">
              <button type="button" className="dialog-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}

        {mode === 'manage' && (
          <>
            {projects.length === 0 ? (
              <p className="panel-note">No saved projects to manage.</p>
            ) : (
              <ul className="project-list">
                {projects.map((project) => (
                  <li className="project-row" key={project.id}>
                    <div className="project-row-copy">
                      <strong>{project.name}</strong>
                      <span>{formatDate(project.updatedAt)}</span>
                      {pendingDeleteId === project.id && (
                        <span role="alert">
                          Delete this saved copy? The open design stays in the workspace.
                        </span>
                      )}
                    </div>
                    {pendingDeleteId === project.id ? (
                      <div className="project-delete-actions">
                        <button
                          type="button"
                          className="dialog-secondary"
                          onClick={() => setPendingDeleteId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="dialog-danger"
                          aria-label={`Confirm delete ${project.name}`}
                          onClick={() => {
                            onDelete(project.id);
                            setPendingDeleteId(null);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="dialog-danger"
                        aria-label={`Delete ${project.name}`}
                        onClick={() => setPendingDeleteId(project.id)}
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="dialog-actions">
              <button type="button" className="dialog-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}

        {mode === 'recovery' && recovery !== null && (
          <>
            <p>
              There is an unsaved recovery copy of <strong>{recovery.name}</strong> from{' '}
              {formatDate(recovery.updatedAt)}.
            </p>
            <p className="panel-note">
              Restore it to continue where you left off, or discard it and start a new design.
            </p>
            <div className="dialog-actions">
              <button type="button" className="dialog-secondary" onClick={onDiscardRecovery}>
                Discard and start new
              </button>
              <button type="button" className="dialog-primary" onClick={onRestore}>
                Restore Design
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

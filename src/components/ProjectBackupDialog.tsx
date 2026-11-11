import { useEffect, useRef, useState } from 'react';
import { BACKUP_MAX_BYTES, parseBackup } from '../app/projectBackup';
import type { DesignDocument } from '../app/projects';

export default function ProjectBackupDialog({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (document: DesignDocument) => string | null;
}) {
  const [document, setDocument] = useState<DesignDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef({ revision: 0 });
  useEffect(() => {
    const requests = generation.current;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => {
      requests.revision++;
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div className="dialog-backdrop">
      <section
        className="project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-title"
      >
        <div className="dialog-heading">
          <h2 id="backup-title">Open backup</h2>
          <button
            type="button"
            className="dialog-close"
            aria-label="Close backup"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p>Choose a .basiscad.json file. Imported pieces are included in the backup.</p>
        <input
          aria-label="Backup file"
          type="file"
          accept=".json"
          autoFocus
          onChange={(event) => {
            const file = event.target.files?.[0];
            const revision = ++generation.current.revision;
            setBusy(false);
            setDocument(null);
            setError(null);
            if (!file) return;
            if (file.size > BACKUP_MAX_BYTES) {
              setError('This backup exceeds the 64 MB file limit.');
              return;
            }
            setBusy(true);
            void file
              .text()
              .then((text) => {
                if (generation.current.revision === revision) setDocument(parseBackup(text));
              })
              .catch((reason: unknown) => {
                if (generation.current.revision === revision)
                  setError(
                    reason instanceof Error ? reason.message : 'Could not read this backup.',
                  );
              })
              .finally(() => {
                if (generation.current.revision === revision) setBusy(false);
              });
          }}
        />
        {busy && <p role="status">Reading backup…</p>}
        {document && (
          <>
            <p>
              <strong>{document.name}</strong> · {document.placed.length} items ·{' '}
              {document.imports?.length ?? 0} imported pieces
            </p>
            <p>Opening replaces the current design. Save or export your current work first.</p>
          </>
        )}
        {error && (
          <p role="alert" className="import-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="dialog-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-primary"
            disabled={!document || busy}
            onClick={() => {
              if (document) setError(onOpen(document));
            }}
          >
            Open backup
          </button>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Brand from './Brand';

interface HeaderProps {
  tools?: ReactNode;
  designName: string;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: string | null;
  onRename: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onOpen: () => void;
  onNew: () => void;
  onManage: () => void;
  canPrint: boolean;
  onPrint: () => void;
}

export default function Header({
  designName,
  canUndo,
  canRedo,
  saveStatus,
  onRename,
  onUndo,
  onRedo,
  onSave,
  onOpen,
  onNew,
  onManage,
  canPrint,
  onPrint,
  tools,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const actions = [
    { label: 'Save Design', onClick: onSave },
    { label: 'Open Design', onClick: onOpen },
    { label: 'New Design', onClick: onNew },
    { label: 'Manage Projects', onClick: onManage },
  ];

  return (
    <header className="header">
      <div className="header-start">
        <Brand />
        <button
          type="button"
          className="design-name-button"
          aria-label={`Rename design ${designName}`}
          onClick={onRename}
        >
          {designName}
          <span aria-hidden="true"> ✎</span>
        </button>
        <div className="history-buttons" role="group" aria-label="Edit history">
          <button
            type="button"
            aria-label="Undo"
            title="Undo (Ctrl/⌘ Z)"
            disabled={!canUndo}
            onClick={onUndo}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo (Ctrl/⌘ Shift Z)"
            disabled={!canRedo}
            onClick={onRedo}
          >
            ↷
          </button>
        </div>
      </div>
      {tools}
      <span className="header-status" role="status">
        {saveStatus ?? 'Milestone 5 · local design'}
      </span>
      <div className="header-menu" ref={menuRef}>
        <button
          type="button"
          className="menu-button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((wasOpen) => !wasOpen)}
        >
          Menu
        </button>
        {menuOpen && (
          <div className="menu-panel" role="menu" aria-label="Design actions">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className="menu-action"
                onClick={() => {
                  setMenuOpen(false);
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className="menu-action"
              disabled={!canPrint}
              onClick={() => {
                setMenuOpen(false);
                onPrint();
              }}
            >
              Print Design
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-action"
              disabled
              title="Help — Milestone 13"
            >
              Help
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

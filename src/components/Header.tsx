import { useEffect, useRef, useState } from 'react';
import { BRAND_RED } from '../app/constants';

/**
 * The BASIScad header. Black bar, white wordmark, red chevrons — the
 * frozen branding from the prototype.
 *
 * The design actions live behind a single Menu button at the top right.
 * The menu opens as a dropdown under the button (absolutely positioned,
 * so the header's fixed height never changes) and closes on an outside
 * click or Escape. The actions themselves are not built yet — Save /
 * Open / New arrive with Milestone 5, Print with Milestone 12, Help
 * with Milestone 13 — so each is a disabled button that says which
 * milestone adds it, instead of a dead-looking button that pretends to
 * work (the prototype shipped dead Settings and Help buttons; this app
 * does not).
 */

const ACTIONS = [
  { label: 'Save Design', milestone: 5 },
  { label: 'Open Design', milestone: 5 },
  { label: 'New Design', milestone: 5 },
  { label: 'Print Design', milestone: 12 },
  { label: 'Help', milestone: 13 },
] as const;

export default function Header() {
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

  return (
    <header className="header">
      <div className="brand" aria-label="BASIScad">
        <svg
          className="brand-chevrons"
          viewBox="0 0 32 32"
          width="28"
          height="28"
          aria-hidden="true"
        >
          <polyline
            points="5,5 15,16 5,27"
            fill="none"
            stroke={BRAND_RED}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="16,5 26,16 16,27"
            fill="none"
            stroke={BRAND_RED}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="brand-wordmark">
          <span className="brand-basis">BASIS</span>
          <span className="brand-cad">cad</span>
        </span>
      </div>
      <span className="header-status">Milestone 3 · place and drag</span>
      <div className="header-menu" ref={menuRef}>
        <button
          type="button"
          className="menu-button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((wasOpen) => !wasOpen);
          }}
        >
          Menu
        </button>
        {menuOpen && (
          <div className="menu-panel" role="menu" aria-label="Design actions">
            {ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className="menu-action"
                disabled
                title={`${action.label} — Milestone ${action.milestone}`}
              >
                {action.label}
              </button>
            ))}
            <p className="menu-note">These arrive in later milestones.</p>
          </div>
        )}
      </div>
    </header>
  );
}

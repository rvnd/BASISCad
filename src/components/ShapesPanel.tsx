import { useState } from 'react';

/**
 * The right-hand Shapes panel. The 17 library pieces do not exist yet —
 * their STLs are uncollected (Milestone 2) — so the panel says so
 * honestly instead of showing invented pieces, thumbnails, or
 * look-alike shapes. It is collapsible; the toggle is cheap and the
 * panel keeps its width when collapsed so the layout does not shift.
 */
export default function ShapesPanel() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className="side-column right-column" aria-label="Shapes">
      <section className="panel">
        <div className="panel-header-row">
          <h2 className="panel-title">Shapes</h2>
          <button
            type="button"
            className="panel-collapse"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand Shapes panel' : 'Collapse Shapes panel'}
            onClick={() => {
              setCollapsed((wasCollapsed) => !wasCollapsed);
            }}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
        {!collapsed && <p className="panel-note">Pieces arrive in Milestone 2.</p>}
      </section>
    </aside>
  );
}

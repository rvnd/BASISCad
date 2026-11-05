import { useState } from 'react';
import { PIECE_CATEGORIES, holeCountLabel, isPieceReady, piecesInCategory } from '../app/library';
import type { LibraryPiece, PieceCategory } from '../app/library';
import ImportPieces from './ImportPieces';

/**
 * The right-hand Shapes panel: the 17 spec pieces in three collapsible
 * sections — Girders, Braces, Plates — plus any pieces imported in
 * this session. The panel itself is collapsible (from Milestone 1).
 *
 * Each entry shows a colour swatch (never a fake thumbnail), its name,
 * its hole count ("holes: ?" when the count is not established), and
 * its status. Spec pieces are marked "STL needed" and cannot be placed
 * — there is no geometry for them yet, and no look-alike is
 * substituted. Imported pieces are marked "Ready". There is no Basic
 * Shapes section and no way to delete a piece from the library.
 */

interface ShapesPanelProps {
  pieces: readonly LibraryPiece[];
  onImport: (file: File, category: PieceCategory, colourHex: string) => void;
  importing: boolean;
  importError: string | null;
}

function PieceEntry({ piece }: { piece: LibraryPiece }) {
  const ready = isPieceReady(piece);
  return (
    <li
      className="library-entry"
      title={ready ? undefined : 'STL not imported yet — use Import Pieces above.'}
    >
      <span
        className="library-swatch"
        style={{ backgroundColor: piece.colourHex }}
        aria-label={`${piece.colourName} colour swatch`}
      />
      <span className="library-name">{piece.name}</span>
      <span className="library-holes">{holeCountLabel(piece)}</span>
      <span
        className={`library-status ${ready ? 'library-status-ready' : 'library-status-needed'}`}
      >
        {ready ? 'Ready' : 'STL needed'}
      </span>
    </li>
  );
}

export default function ShapesPanel({
  pieces,
  onImport,
  importing,
  importError,
}: ShapesPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<PieceCategory>>(
    () => new Set(),
  );

  const toggleSection = (category: PieceCategory): void => {
    setCollapsedSections((previous) => {
      const next = new Set(previous);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

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
        {!collapsed && (
          <>
            <ImportPieces onImport={onImport} importing={importing} error={importError} />
            {PIECE_CATEGORIES.map((category) => {
              const sectionPieces = piecesInCategory(pieces, category.id);
              const sectionCollapsed = collapsedSections.has(category.id);
              return (
                <section className="library-section" key={category.id} aria-label={category.label}>
                  <div className="panel-header-row library-section-header">
                    <h3 className="library-section-title">
                      {category.label} ({sectionPieces.length})
                    </h3>
                    <button
                      type="button"
                      className="panel-collapse"
                      aria-expanded={!sectionCollapsed}
                      aria-label={
                        sectionCollapsed
                          ? `Expand ${category.label} section`
                          : `Collapse ${category.label} section`
                      }
                      onClick={() => {
                        toggleSection(category.id);
                      }}
                    >
                      {sectionCollapsed ? '▸' : '▾'}
                    </button>
                  </div>
                  {!sectionCollapsed && (
                    <ul className="library-list">
                      {sectionPieces.map((piece) => (
                        <PieceEntry key={piece.id} piece={piece} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            <p className="panel-note">
              The 17 pieces above need their STL files before they can be placed. Import one to try
              it.
            </p>
          </>
        )}
      </section>
    </aside>
  );
}

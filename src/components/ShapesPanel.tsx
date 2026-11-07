import { useState } from 'react';
import {
  PIECE_CATEGORIES,
  hasModelFile,
  holeCountLabel,
  isPieceReady,
  piecesInCategory,
} from '../app/library';
import type { LibraryPiece, PieceCategory } from '../app/library';
import ImportPieces from './ImportPieces';

/**
 * The right-hand Shapes panel: all 17 spec pieces (each with a
 * bundled STL file) plus any pieces imported in this session, in
 * three collapsible sections (Girders, Braces, Plates). The panel
 * itself is collapsible (from Milestone 1).
 *
 * Each entry shows a colour swatch (never a fake thumbnail), its name,
 * its hole count ("holes: ?" when the count is not established), and
 * its status. Imported pieces are marked "Ready". There is no Basic
 * Shapes section and no way to delete a piece from the library.
 */

interface ShapesPanelProps {
  pieces: readonly LibraryPiece[];
  onImport: (file: File, category: PieceCategory, colourHex: string) => void;
  importing: boolean;
  importError: string | null;
  /** Place a Ready piece on the workplane (Milestone 3). */
  onPlace: (libraryId: string) => void;
}

function PieceEntry({ piece, onPlace }: { piece: LibraryPiece; onPlace: (id: string) => void }) {
  const ready = isPieceReady(piece);
  // A bundled file that is still loading is not ready yet, but it is
  // not "STL needed" either — its file is already bundled.
  const status = ready ? 'Ready' : piece.bundledFile !== undefined ? 'Loading…' : 'STL needed';
  const statusClass = ready
    ? 'library-status-ready'
    : piece.bundledFile !== undefined
      ? 'library-status-standin'
      : 'library-status-needed';
  const title = ready
    ? undefined
    : piece.bundledFile !== undefined
      ? 'Bundled STL loading — use Import Pieces above to try another file.'
      : 'STL not imported yet — use Import Pieces above.';
  return (
    <li className="library-entry" title={title}>
      <span
        className="library-swatch"
        style={{ backgroundColor: piece.colourHex }}
        aria-label={`${piece.colourName} colour swatch`}
      />
      <span className="library-name">{piece.name}</span>
      <span className="library-holes">{holeCountLabel(piece)}</span>
      <span className={`library-status ${statusClass}`}>{status}</span>
      <button
        type="button"
        className="library-place"
        disabled={!ready}
        title={
          ready
            ? `Place ${piece.name} on the workplane`
            : 'No STL yet — this piece cannot be placed'
        }
        onClick={() => {
          onPlace(piece.id);
        }}
      >
        Place
      </button>
    </li>
  );
}

export default function ShapesPanel({
  pieces,
  onImport,
  importing,
  importError,
  onPlace,
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
              // Only pieces with a model file are listed; a section
              // with none is hidden rather than shown empty.
              const sectionPieces = piecesInCategory(pieces, category.id).filter(hasModelFile);
              if (sectionPieces.length === 0) {
                return null;
              }
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
                        <PieceEntry key={piece.id} piece={piece} onPlace={onPlace} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            <p className="panel-note">
              All 17 kit pieces are shown — each has its own STL file. Import a piece above to add
              it to the list.
            </p>
          </>
        )}
      </section>
    </aside>
  );
}

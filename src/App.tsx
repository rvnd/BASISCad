import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.tsx';
import ShapesPanel from './components/ShapesPanel.tsx';
import ViewControls from './components/ViewControls.tsx';
import Viewport from './components/Viewport.tsx';
import { PIECE_COLOURS, SPEC_PIECES, isPieceReady, standInPieces } from './app/library';
import type { LibraryPiece, PieceCategory, PieceSizeMm } from './app/library';
import { clampPosition, createPlacedPiece, removePlaced, toggleSelection } from './app/design';
import type { PlacedPiece, SelectionMode } from './app/design';
import { registerGeometry } from './three/libraryGeometry';
import { loadPieceGeometry, loadPieceGeometryFromUrl } from './three/loadPieceFile';
import { DEFAULT_CAMERA_VIEW_ID } from './three/cameraViews';
import type { CameraViewId } from './three/cameraViews';
import type { ViewportDesignCallbacks, ViewportHandle } from './three/viewport';

/**
 * App shell — composition and view state only, no 3D logic.
 *
 * Milestone 1 layout: black header on top, then a row with the view
 * controls in a narrow left column, the Three.js viewport filling the
 * centre, and the Shapes panel on the right. The viewport handle lives
 * in a ref (never in state, never in React's hands as an object to
 * render); the view controls call its methods imperatively. The current
 * view label is React state, updated only when a preset is picked or
 * Fit is pressed — dragging the canvas to orbit does not change it.
 *
 * Milestone 2 adds the library: the 17 spec pieces (no geometry yet)
 * plus pieces imported from STL/OBJ files in this session. React holds
 * only the imported pieces' metadata; their geometry lives in the
 * geometry registry (`src/three/libraryGeometry.ts`).
 *
 * Milestone 3 adds design state: the pieces placed on the workplane
 * (`PlacedPiece[]`), which piece is selected, and the selection mode.
 * The viewport renders them from this data via `syncDesign` and reports
 * clicks and drags back as data. Milestone 5 adds design state (name,
 * save, undo) above this component.
 */
export default function App() {
  const viewportRef = useRef<ViewportHandle | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const [currentView, setCurrentView] = useState<CameraViewId>(DEFAULT_CAMERA_VIEW_ID);
  const [importedPieces, setImportedPieces] = useState<readonly LibraryPiece[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importCounter = useRef(0);
  // The spec pieces, with stand-in geometry attached once it loads.
  const [specPieces, setSpecPieces] = useState<readonly LibraryPiece[]>(SPEC_PIECES);
  // Milestone 3 design state: placed pieces, selection, selection mode.
  const [placed, setPlaced] = useState<readonly PlacedPiece[]>([]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('move');
  const placedCounter = useRef(0);

  // Load the bundled temporary stand-in STLs (see
  // public/library/LIBRARY_SOURCES.md). A stand-in that fails to load
  // simply leaves its piece marked "STL needed".
  useEffect(() => {
    let cancelled = false;
    for (const piece of standInPieces()) {
      if (piece.standIn === undefined) {
        continue;
      }
      const standIn = piece.standIn;
      const geometryId = `standin-${piece.id}`;
      loadPieceGeometryFromUrl(`${import.meta.env.BASE_URL}${standIn.file}`)
        .then((loaded) => {
          if (cancelled) {
            return;
          }
          registerGeometry(geometryId, loaded.geometry);
          setSpecPieces((previous) =>
            previous.map((entry) =>
              entry.id === piece.id ? { ...entry, geometryId, sizeMm: loaded.sizeMm } : entry,
            ),
          );
        })
        .catch(() => {
          // Stand-in failed to load; the piece stays "STL needed".
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const onViewportReady = useCallback((handle: ViewportHandle | null) => {
    viewportRef.current = handle;
    setViewportReady(handle !== null);
  }, []);

  const selectView = useCallback((viewId: CameraViewId) => {
    viewportRef.current?.setView(viewId);
    setCurrentView(viewId);
  }, []);

  const fit = useCallback(() => {
    viewportRef.current?.fit();
    setCurrentView(DEFAULT_CAMERA_VIEW_ID);
  }, []);

  const onImport = useCallback((file: File, category: PieceCategory, colourHex: string) => {
    setImporting(true);
    setImportError(null);
    loadPieceGeometry(file)
      .then((loaded) => {
        importCounter.current += 1;
        const id = `imported-${importCounter.current}`;
        registerGeometry(id, loaded.geometry);
        const colourName = PIECE_COLOURS.find((colour) => colour.hex === colourHex)?.name ?? 'Grey';
        const name = file.name.replace(/\.[^.]+$/, '') || 'Imported piece';
        const piece: LibraryPiece = {
          id,
          name,
          category,
          colourName,
          colourHex,
          // An imported file carries no hole information.
          holeCount: null,
          sizeMm: loaded.sizeMm,
          source: 'import',
          geometryId: id,
        };
        setImportedPieces((previous) => [...previous, piece]);
      })
      .catch((error: unknown) => {
        setImportError(error instanceof Error ? error.message : 'Could not import that file.');
      })
      .finally(() => {
        setImporting(false);
      });
  }, []);

  const libraryPieces: readonly LibraryPiece[] = useMemo(
    () => [...specPieces, ...importedPieces],
    [specPieces, importedPieces],
  );

  // The viewport's piece callbacks must keep a stable identity (the
  // viewport mounts once), so they read the library through a ref.
  const libraryByIdRef = useRef(new Map<string, LibraryPiece>());
  useEffect(() => {
    libraryByIdRef.current = new Map(libraryPieces.map((piece) => [piece.id, piece]));
  }, [libraryPieces]);

  // Keep the 3D scene in sync with the design data.
  useEffect(() => {
    viewportRef.current?.syncDesign(placed, libraryPieces, selectedIds);
  }, [placed, libraryPieces, selectedIds, viewportReady]);

  const designCallbacks: ViewportDesignCallbacks = useMemo(
    () => ({
      onSelectPiece(placedId: string, additive: boolean): void {
        setSelectedIds((previous) => toggleSelection(previous, placedId, additive));
        // Selecting always returns the piece to Move mode, keeping its rotation.
        setSelectionMode('move');
      },
      onDeselectAll(): void {
        setSelectedIds([]);
      },
      onDragPiece(placedId: string, x: number, z: number): void {
        setPlaced((previous) =>
          previous.map((piece) => {
            if (piece.id !== placedId) {
              return piece;
            }
            const sizeMm: PieceSizeMm | null =
              libraryByIdRef.current.get(piece.libraryId)?.sizeMm ?? null;
            return {
              ...piece,
              position: sizeMm === null ? { x, z } : clampPosition(x, z, sizeMm),
            };
          }),
        );
      },
    }),
    [],
  );

  const placePiece = useCallback(
    (libraryId: string) => {
      const piece = libraryPieces.find((entry) => entry.id === libraryId);
      if (piece === undefined || !isPieceReady(piece)) {
        return;
      }
      const sizeMm = piece.sizeMm;
      if (sizeMm === null) {
        return;
      }
      placedCounter.current += 1;
      const id = `placed-${placedCounter.current}`;
      setPlaced((previous) => [
        ...previous,
        createPlacedPiece(id, libraryId, previous.length, sizeMm),
      ]);
      setSelectedIds([id]);
      setSelectionMode('move');
    },
    [libraryPieces],
  );

  const removeSelected = useCallback(() => {
    setPlaced((previous) => removePlaced(previous, selectedIds));
    setSelectedIds([]);
  }, [selectedIds]);

  const selectedPieces: readonly { id: string; name: string }[] = selectedIds.flatMap((id) => {
    const piece = placed.find((entry) => entry.id === id);
    const libraryPiece =
      piece === undefined ? undefined : libraryPieces.find((entry) => entry.id === piece.libraryId);
    return libraryPiece === undefined ? [] : [{ id, name: libraryPiece.name }];
  });

  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <ViewControls
          currentView={currentView}
          onSelectView={selectView}
          onZoomIn={() => viewportRef.current?.zoomIn()}
          onZoomOut={() => viewportRef.current?.zoomOut()}
          onFit={fit}
          disabled={!viewportReady}
          selectedPieces={selectedPieces}
          selectionMode={selectionMode}
          onRemoveSelected={removeSelected}
        />
        <div className="viewport-wrap">
          <Viewport onReady={onViewportReady} designCallbacks={designCallbacks} />
        </div>
        <ShapesPanel
          pieces={libraryPieces}
          onImport={onImport}
          importing={importing}
          importError={importError}
          onPlace={placePiece}
        />
      </main>
    </div>
  );
}

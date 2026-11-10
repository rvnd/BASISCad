import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import AngleBadge from './components/AngleBadge.tsx';
import Header from './components/Header.tsx';
import ConnectControls from './components/ConnectControls';
import HolePicker from './components/HolePicker';
import ProjectDialog from './components/ProjectDialog.tsx';
import type { ProjectDialogMode } from './components/ProjectDialog.tsx';
import MoveRotatePanel from './components/MoveRotatePanel.tsx';
import type { SingleSelection } from './components/MoveRotatePanel.tsx';
import ShapesPanel from './components/ShapesPanel.tsx';
import ViewControls from './components/ViewControls.tsx';
import Viewport from './components/Viewport.tsx';
import { PIECE_COLOURS, SPEC_PIECES, bundledPieces, isPieceReady } from './app/library';
import type { LibraryPiece, PieceCategory, PieceSizeMm } from './app/library';
import { parseLibraryHoles } from './app/libraryHoles';
import { fastenerName } from './app/connections';
import type { HoleRef } from './app/connections';
import type { HoleTarget } from './three/connectionHoles';
import { connectPieces, DEFAULT_CONNECTION_OPTIONS } from './three/connectPieces';
import { fastenStack } from './three/fastening';
import {
  addPiecesRotation,
  centerDesign,
  createPlacedPiece,
  flipPiecesRotation,
  removePlaced,
  resetPiecesRotation,
  setPiecesPosition,
  setPiecesRotation,
  toggleSelection,
} from './app/design';
import type { PositionMm, SelectionMode } from './app/design';
import { canRedo, canUndo, createDesignHistory, reduceDesignHistory } from './app/designHistory';
import {
  clearRecoveryDraft,
  deleteSavedDesign,
  readRecoveryDraft,
  readSavedDesigns,
  recoveryMatchesSavedDesign,
  saveDesign as persistDesign,
  writeRecoveryDraft,
} from './app/projects';
import type { DesignDocument } from './app/projects';
import { registerGeometry } from './three/libraryGeometry';
import {
  constrainDesignEdit,
  dragPiece,
  freePlacement,
  geometryLookup,
} from './three/designConstraints';
import { loadPieceGeometry, loadPieceGeometryFromUrl } from './three/loadPieceFile';
import { DEFAULT_CAMERA_VIEW_ID } from './three/cameraViews';
import type { CameraViewId } from './three/cameraViews';
import type { ViewportDesignCallbacks, ViewportHandle } from './three/viewport';
import type { RotationAxis } from './three/rotationHandles';

interface ActiveDesign {
  id: string;
  name: string;
}

function createDesignId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `design-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function readInitialProjectState(): {
  saved: readonly DesignDocument[];
  recovery: DesignDocument | null;
  dialog: ProjectDialogMode;
} {
  const saved = readSavedDesigns(window.localStorage);
  const recovery = readRecoveryDraft(window.localStorage);
  const needsRecovery = recovery !== null && !recoveryMatchesSavedDesign(recovery, saved);
  return {
    saved,
    recovery: needsRecovery ? recovery : null,
    dialog: needsRecovery ? 'recovery' : 'new',
  };
}

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
 * clicks and drags back as data. Milestone 5 adds named local designs,
 * recovery, and undo/redo history above this component.
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
  const [history, dispatchHistory] = useReducer(reduceDesignHistory, undefined, () =>
    createDesignHistory(),
  );
  const placed = history.present;
  const placedRef = useRef(placed);
  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);
  const dragBaseHeights = useRef(new Map<string, number>());
  const [initialProjects] = useState(readInitialProjectState);
  const [activeDesign, setActiveDesign] = useState<ActiveDesign>(() => ({
    id: createDesignId(),
    name: '',
  }));
  const [savedDesigns, setSavedDesigns] = useState<readonly DesignDocument[]>(
    initialProjects.saved,
  );
  const [recoveryDraft, setRecoveryDraft] = useState<DesignDocument | null>(
    initialProjects.recovery,
  );
  const [dialogMode, setDialogMode] = useState<ProjectDialogMode | null>(initialProjects.dialog);
  const [startupDialog, setStartupDialog] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('move');
  const [snapHoles, setSnapHoles] = useState(true);
  const [alignedHoleCount, setAlignedHoleCount] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [firstHole, setFirstHole] = useState<readonly HoleRef[] | null>(null);
  const [holeTargets, setHoleTargets] = useState<readonly HoleTarget[]>([]);
  const [connectionOptions, setConnectionOptions] = useState(DEFAULT_CONNECTION_OPTIONS);
  const [retryHoles, setRetryHoles] = useState<{
    first: readonly HoleRef[];
    second: readonly HoleRef[];
  } | null>(null);
  const [pendingScrew, setPendingScrew] = useState<HoleRef | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const cancelConnection = useCallback(() => {
    setConnecting(false);
    setFirstHole(null);
    setPendingScrew(null);
    dispatchHistory({ type: 'end-edit' });
  }, []);
  useEffect(() => {
    viewportRef.current?.setHoleMarkersEnabled(connecting);
  }, [connecting, viewportReady]);
  useEffect(() => {
    if (!connectionNotice) return;
    const timer = window.setTimeout(() => setConnectionNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [connectionNotice]);
  // Milestone 4: the quick-rotate step size for the panel buttons.
  const [rotateStep, setRotateStep] = useState(45);
  // Milestone 4: the rotation handle the pointer currently hovers.
  const [handleHover, setHandleHover] = useState<RotationAxis | null>(null);
  // Milestone 4: the axis (and piece) of the last handle drag, for the
  // big live angle badge. Set when a drag starts; the badge then shows
  // the piece's live angle while dragging and lingers after release
  // (click-to-type needs a badge that is still there), hiding when
  // the piece is deselected or the mode leaves Rotate.
  const [badgeAxis, setBadgeAxis] = useState<{
    placedId: string;
    axis: RotationAxis;
  } | null>(null);
  const lastHistoryPresentRef = useRef(placed);

  // Load the bundled library STLs (see
  // public/library/LIBRARY_SOURCES.md). A file that fails to load
  // simply leaves its piece unplaceable.
  useEffect(() => {
    let cancelled = false;
    const holeMetadata = fetch(`${import.meta.env.BASE_URL}library/holes.json`)
      .then((response) => (response.ok ? response.json() : {}))
      .then(parseLibraryHoles)
      .catch(() => parseLibraryHoles(null));
    for (const piece of bundledPieces()) {
      if (piece.bundledFile === undefined) {
        continue;
      }
      const bundledFile = piece.bundledFile;
      const geometryId = `bundled-${piece.id}`;
      Promise.all([
        loadPieceGeometryFromUrl(`${import.meta.env.BASE_URL}${bundledFile.file}`),
        holeMetadata,
      ])
        .then(([loaded, holes]) => {
          if (cancelled) {
            return;
          }
          registerGeometry(geometryId, loaded.geometry);
          setSpecPieces((previous) =>
            previous.map((entry) =>
              entry.id === piece.id
                ? { ...entry, geometryId, sizeMm: loaded.sizeMm, holes: holes[piece.id] }
                : entry,
            ),
          );
        })
        .catch(() => {
          // Stand-in failed to load; the piece stays unplaceable.
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeDesign.name.length === 0) {
      return;
    }
    try {
      writeRecoveryDraft(window.localStorage, {
        ...activeDesign,
        placed,
        updatedAt: Date.now(),
      });
    } catch {
      queueMicrotask(() => setStorageError('Could not save the recovery copy in this browser.'));
    }
  }, [activeDesign, placed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        cancelConnection();
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      cancelConnection();
      dispatchHistory({ type: event.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelConnection]);

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

  // Keep the 3D scene in sync with the design data. The selection
  // mode is a dependency too: entering Rotate mode must show the
  // rotation handles at once, not on the next design change.
  useEffect(() => {
    viewportRef.current?.syncDesign(placed, libraryPieces, selectedIds);
  }, [placed, libraryPieces, selectedIds, selectionMode, viewportReady]);

  // Keep the viewport's drag behaviour in step with the selection mode.
  useEffect(() => {
    viewportRef.current?.setSelectionMode(selectionMode);
  }, [selectionMode, viewportReady]);

  useEffect(() => {
    viewportRef.current?.setHoleSnappingEnabled(snapHoles);
  }, [snapHoles, viewportReady]);

  useEffect(() => {
    if (lastHistoryPresentRef.current !== placed) {
      lastHistoryPresentRef.current = placed;
      setSaveStatus(null);
    }
  }, [placed]);

  const sizeById: ReadonlyMap<string, PieceSizeMm> = useMemo(() => {
    const map = new Map<string, PieceSizeMm>();
    for (const piece of libraryPieces) {
      if (piece.sizeMm !== null) {
        map.set(piece.id, piece.sizeMm);
      }
    }
    return map;
  }, [libraryPieces]);

  const centerProject = useCallback(() => {
    dispatchHistory({
      type: 'edit',
      apply: (previous) =>
        constrainDesignEdit(
          previous,
          centerDesign(previous, sizeById),
          geometryLookup(libraryByIdRef.current),
        ),
    });
  }, [sizeById]);

  const closeDialog = useCallback(() => {
    setDialogMode(startupDialog ? 'new' : null);
  }, [startupDialog]);

  const showDialog = useCallback(
    (mode: ProjectDialogMode) => {
      cancelConnection();
      if (mode === 'open' || mode === 'manage') {
        setSavedDesigns(readSavedDesigns(window.localStorage));
      }
      setDialogMode(mode);
    },
    [cancelConnection],
  );

  const startDesign = useCallback((name: string) => {
    clearRecoveryDraft(window.localStorage);
    setRecoveryDraft(null);
    setActiveDesign({ id: createDesignId(), name });
    dispatchHistory({ type: 'replace', placed: [] });
    setSelectedIds([]);
    setSelectionMode('move');
    setBadgeAxis(null);
    setDialogMode(null);
    setStartupDialog(false);
    setSaveStatus(null);
  }, []);

  const renameDesign = useCallback((name: string) => {
    setActiveDesign((previous) => ({ ...previous, name }));
    setDialogMode(null);
  }, []);

  const openSavedDesign = useCallback((design: DesignDocument) => {
    setActiveDesign({ id: design.id, name: design.name });
    dispatchHistory({ type: 'replace', placed: design.placed });
    setSelectedIds([]);
    setSelectionMode('move');
    setBadgeAxis(null);
    setDialogMode(null);
    setStartupDialog(false);
    setSaveStatus(null);
  }, []);

  const saveActiveDesign = useCallback(() => {
    if (activeDesign.name.trim().length === 0) {
      showDialog('new');
      return;
    }
    try {
      const saved = persistDesign(window.localStorage, {
        ...activeDesign,
        placed,
        updatedAt: Date.now(),
      });
      setSavedDesigns(saved);
      setSaveStatus('Saved on this device');
      setStorageError(null);
    } catch {
      setStorageError('Could not save this design in this browser.');
    }
  }, [activeDesign, placed, showDialog]);

  const removeSavedDesign = useCallback((id: string) => {
    try {
      setSavedDesigns(deleteSavedDesign(window.localStorage, id));
      setStorageError(null);
    } catch {
      setStorageError('Could not delete that saved project.');
    }
  }, []);

  const restoreRecovery = useCallback(() => {
    if (recoveryDraft === null) {
      return;
    }
    setActiveDesign({ id: recoveryDraft.id, name: recoveryDraft.name });
    dispatchHistory({ type: 'replace', placed: recoveryDraft.placed });
    setSelectedIds([]);
    setSelectionMode('move');
    setBadgeAxis(null);
    setDialogMode(null);
    setStartupDialog(false);
  }, [recoveryDraft]);

  const discardRecovery = useCallback(() => {
    clearRecoveryDraft(window.localStorage);
    setRecoveryDraft(null);
    setDialogMode('new');
    setStartupDialog(true);
  }, []);

  const designCallbacks: ViewportDesignCallbacks = useMemo(
    () => ({
      onHoleTargets: setHoleTargets,
      onAlignmentChange: setAlignedHoleCount,
      onBeginEdit(): void {
        dragBaseHeights.current = new Map(
          placedRef.current.map((piece) => [piece.id, piece.position.y]),
        );
        dispatchHistory({ type: 'begin-edit' });
      },
      onEndEdit(): void {
        dispatchHistory({ type: 'end-edit' });
      },
      onSelectPiece(placedId: string, additive: boolean): void {
        setSelectedIds((previous) => toggleSelection(previous, placedId, additive));
        // Selecting keeps the current mode and the piece's rotation.
      },
      onDeselectAll(): void {
        setSelectedIds([]);
        setBadgeAxis(null);
      },
      onDragPiece(placedId: string, x: number, z: number, y?: number): void {
        dispatchHistory({
          type: 'edit',
          apply: (previous) => {
            const piece = previous.find((entry) => entry.id === placedId);
            if (!piece) return previous;
            const moved = dragPiece(
              piece,
              { x, y: y ?? piece.position.y, z },
              previous,
              geometryLookup(libraryByIdRef.current),
              dragBaseHeights.current.get(placedId) ?? piece.position.y,
            );
            return moved === piece
              ? previous
              : previous.map((entry) => (entry.id === placedId ? moved : entry));
          },
        });
      },
      onRotatePiece(placedId: string, axis: RotationAxis, angleDeg: number): void {
        dispatchHistory({
          type: 'edit',
          apply: (previous) =>
            constrainDesignEdit(
              previous,
              setPiecesRotation(previous, [placedId], axis, angleDeg),
              geometryLookup(libraryByIdRef.current),
            ),
        });
      },
      onBeginRotate(): void {
        // Grabbing a handle switches the selection to Rotate mode.
        setSelectionMode('rotate');
      },
      onHandleDrag(placedId: string | null, axis: RotationAxis | null): void {
        // The badge appears on drag start and lingers after release so
        // it can be clicked to type an angle — the null on release
        // needs no state change here.
        if (placedId !== null && axis !== null) {
          setBadgeAxis({ placedId, axis });
        }
      },
      onHandleHover(axis: RotationAxis | null): void {
        setHandleHover(axis);
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
      const id = `placed-${createDesignId()}`;
      dispatchHistory({
        type: 'edit',
        apply: (previous) => {
          const next = freePlacement(
            createPlacedPiece(id, libraryId, previous.length, sizeMm),
            previous,
            geometryLookup(libraryByIdRef.current),
          );
          return next ? [...previous, next] : previous;
        },
      });
      setSelectedIds([id]);
      setSelectionMode('move');
    },
    [libraryPieces],
  );

  const removeSelected = useCallback(() => {
    dispatchHistory({ type: 'edit', apply: (previous) => removePlaced(previous, selectedIds) });
    setSelectedIds([]);
  }, [selectedIds]);

  // Milestone 4: precise move and rotate, acting on the selection.
  const moveSelected = useCallback(
    (axis: keyof PositionMm, value: number) => {
      dispatchHistory({
        type: 'edit',
        apply: (previous) => {
          const single = previous.find((piece) => piece.id === selectedIds[0]);
          if (single === undefined) {
            return previous;
          }
          return constrainDesignEdit(
            previous,
            setPiecesPosition(
              previous,
              selectedIds,
              { ...single.position, [axis]: value },
              sizeById,
            ),
            geometryLookup(libraryByIdRef.current),
          );
        },
      });
    },
    [selectedIds, sizeById],
  );

  const rotateStepSelected = useCallback(
    (axis: RotationAxis, direction: 1 | -1) => {
      dispatchHistory({
        type: 'edit',
        apply: (previous) =>
          constrainDesignEdit(
            previous,
            addPiecesRotation(previous, selectedIds, axis, direction * rotateStep),
            geometryLookup(libraryByIdRef.current),
          ),
      });
    },
    [selectedIds, rotateStep],
  );

  const setAngleSelected = useCallback(
    (axis: RotationAxis, degrees: number) => {
      dispatchHistory({
        type: 'edit',
        apply: (previous) =>
          constrainDesignEdit(
            previous,
            setPiecesRotation(previous, selectedIds, axis, degrees),
            geometryLookup(libraryByIdRef.current),
          ),
      });
    },
    [selectedIds],
  );

  const flipSelected = useCallback(
    (axis: RotationAxis) => {
      dispatchHistory({
        type: 'edit',
        apply: (previous) =>
          constrainDesignEdit(
            previous,
            flipPiecesRotation(previous, selectedIds, axis),
            geometryLookup(libraryByIdRef.current),
          ),
      });
    },
    [selectedIds],
  );

  const resetOrientationSelected = useCallback(() => {
    dispatchHistory({
      type: 'edit',
      apply: (previous) =>
        constrainDesignEdit(
          previous,
          resetPiecesRotation(previous, selectedIds),
          geometryLookup(libraryByIdRef.current),
        ),
    });
  }, [selectedIds]);

  const rotate90Selected = useCallback(
    (axis: RotationAxis) => {
      dispatchHistory({
        type: 'edit',
        apply: (previous) =>
          constrainDesignEdit(
            previous,
            addPiecesRotation(previous, selectedIds, axis, 90),
            geometryLookup(libraryByIdRef.current),
          ),
      });
    },
    [selectedIds],
  );

  const setAngleForPiece = useCallback((placedId: string, axis: RotationAxis, degrees: number) => {
    // The badge types an angle for the dragged piece only — unlike
    // the panel's typed fields, which apply to the whole selection.
    dispatchHistory({
      type: 'edit',
      apply: (previous) =>
        constrainDesignEdit(
          previous,
          setPiecesRotation(previous, [placedId], axis, degrees),
          geometryLookup(libraryByIdRef.current),
        ),
    });
  }, []);

  const handleSetMode = useCallback((mode: SelectionMode) => {
    setSelectionMode(mode);
    // Leaving Rotate hides the angle badge.
    if (mode !== 'rotate') {
      setBadgeAxis(null);
    }
  }, []);

  const attemptConnection = (
    first: readonly HoleRef[],
    second: readonly HoleRef[],
    options = connectionOptions,
  ) => {
    setRetryHoles({ first, second });
    const result = connectPieces(
      placed,
      libraryByIdRef.current,
      first,
      second,
      viewportRef.current?.cameraPosition() ?? { x: 0, y: 600, z: 600 },
      options,
    );
    setConnecting(false);
    setFirstHole(null);
    setConnectionNotice(null);
    if (!result) {
      setConnectionNotice('No clear connection found. Change Connection options and retry.');
      return;
    }
    dispatchHistory({ type: 'begin-edit' });
    dispatchHistory({ type: 'edit', apply: () => result.placed });
    setSelectedIds([result.movingId]);
    setSelectionMode('move');
    if (result.extendedFastener) dispatchHistory({ type: 'end-edit' });
    else setPendingScrew(result.hole);
  };

  const pickHole = (members: readonly HoleRef[]) => {
    if (!firstHole) {
      setFirstHole(members);
      return;
    }
    attemptConnection(firstHole, members);
  };

  const addPendingScrew = () => {
    if (!pendingScrew) return;
    const next = fastenStack(
      placed,
      libraryByIdRef.current,
      pendingScrew,
      `fastener-${createDesignId()}`,
      true,
    );
    if (next) dispatchHistory({ type: 'edit', apply: () => next });
    else
      setConnectionNotice(
        'These holes are separated or have more than four layers. No fastener was added.',
      );
    cancelConnection();
  };

  const selectedPieces: readonly { id: string; name: string }[] = selectedIds.flatMap((id) => {
    const piece = placed.find((entry) => entry.id === id);
    const libraryPiece =
      piece === undefined ? undefined : libraryPieces.find((entry) => entry.id === piece.libraryId);
    return piece?.fastener
      ? [{ id, name: fastenerName(piece.fastener) }]
      : libraryPiece === undefined
        ? []
        : [{ id, name: libraryPiece.name }];
  });

  // The single selected piece, with its live position and rotation,
  // for the Move/Rotate panel; null when several are selected.
  const singleSelected: SingleSelection | null =
    selectedIds.length === 1
      ? (() => {
          const piece = placed.find((entry) => entry.id === selectedIds[0]);
          const libraryPiece =
            piece === undefined
              ? undefined
              : libraryPieces.find((entry) => entry.id === piece.libraryId);
          if (piece === undefined || (!piece.fastener && libraryPiece === undefined)) {
            return null;
          }
          return {
            id: piece.id,
            name: piece.fastener ? fastenerName(piece.fastener) : libraryPiece!.name,
            position: piece.position,
            rotation: piece.rotation,
          };
        })()
      : null;

  return (
    <div className="app">
      <Header
        tools={
          <ConnectControls
            active={connecting}
            disabled={placed.filter((piece) => !piece.fastener).length < 2 || pendingScrew !== null}
            options={connectionOptions}
            canRetry={retryHoles !== null && pendingScrew === null}
            onOptions={setConnectionOptions}
            onToggle={() => {
              cancelConnection();
              setConnectionNotice(null);
              setConnecting(!connecting);
            }}
            onRetry={(bestFit) => {
              const options = bestFit
                ? { eitherSide: true, moreAngles: true, moveAssembly: true }
                : connectionOptions;
              setConnectionOptions(options);
              if (retryHoles) attemptConnection(retryHoles.first, retryHoles.second, options);
              else {
                cancelConnection();
                setConnecting(true);
              }
            }}
          />
        }
        designName={activeDesign.name || 'Name this design'}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        saveStatus={saveStatus}
        onRename={() => showDialog('rename')}
        onUndo={() => {
          cancelConnection();
          dispatchHistory({ type: 'undo' });
        }}
        onRedo={() => {
          cancelConnection();
          dispatchHistory({ type: 'redo' });
        }}
        onSave={saveActiveDesign}
        onOpen={() => showDialog('open')}
        onNew={() => showDialog('new')}
        onManage={() => showDialog('manage')}
      />
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
          hasPieces={placed.length > 0}
          onCenterProject={centerProject}
          snapHoles={snapHoles}
          alignedHoleCount={alignedHoleCount}
          onSnapHolesChange={setSnapHoles}
        />
        <div className="viewport-wrap">
          <Viewport onReady={onViewportReady} designCallbacks={designCallbacks} />
          {connecting && <HolePicker targets={holeTargets} first={firstHole} onPick={pickHole} />}
          {connectionNotice && (
            <p className="connection-notice" role="alert">
              {connectionNotice}
            </p>
          )}
          {storageError !== null && (
            <p className="storage-alert" role="alert">
              {storageError}
            </p>
          )}
          {!connecting && (
            <MoveRotatePanel
              key={singleSelected?.id ?? `multi-${selectedIds.length}`}
              single={singleSelected}
              selectedCount={selectedIds.length}
              mode={selectionMode}
              step={rotateStep}
              hoverAxis={handleHover}
              onSetMode={handleSetMode}
              onSetStep={setRotateStep}
              onMove={moveSelected}
              onRotateStep={rotateStepSelected}
              onRotate90={rotate90Selected}
              onSetAngle={setAngleSelected}
              onFlip={flipSelected}
              onResetOrientation={resetOrientationSelected}
            />
          )}
          {badgeAxis !== null &&
            selectionMode === 'rotate' &&
            selectedIds.includes(badgeAxis.placedId) &&
            (() => {
              const piece = placed.find((entry) => entry.id === badgeAxis.placedId);
              if (piece === undefined) {
                return null;
              }
              return (
                <AngleBadge
                  axis={badgeAxis.axis}
                  angle={piece.rotation[badgeAxis.axis]}
                  onSetAngle={(axis, degrees) => {
                    setAngleForPiece(badgeAxis.placedId, axis, degrees);
                  }}
                />
              );
            })()}
        </div>
        <ShapesPanel
          pieces={libraryPieces}
          onImport={onImport}
          importing={importing}
          importError={importError}
          onPlace={placePiece}
        />
      </main>
      {pendingScrew && (
        <div className="dialog-backdrop">
          <section
            className="project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="screw-question"
          >
            <h2 id="screw-question">Add screw and nut?</h2>
            <div className="dialog-actions">
              <button type="button" className="dialog-primary" autoFocus onClick={addPendingScrew}>
                Yes
              </button>
              <button type="button" className="dialog-secondary" onClick={cancelConnection}>
                Not now
              </button>
            </div>
          </section>
        </div>
      )}
      {dialogMode !== null && (
        <ProjectDialog
          key={dialogMode}
          mode={dialogMode}
          currentName={activeDesign.name}
          projects={savedDesigns}
          recovery={recoveryDraft}
          canClose={!startupDialog}
          onClose={closeDialog}
          onCreate={startDesign}
          onRename={renameDesign}
          onOpen={openSavedDesign}
          onDelete={removeSavedDesign}
          onRestore={restoreRecovery}
          onDiscardRecovery={discardRecovery}
          onShowOpen={() => showDialog('open')}
        />
      )}
    </div>
  );
}

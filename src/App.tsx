import PrintViewDialog from './components/PrintViewDialog';
import PrintReport from './components/PrintReport';
import { printBudget } from './app/printBudget';
import type { PrintBudget } from './app/printBudget';
import type { PrintSnapshot, PrintView } from './three/printSnapshot';
import LabelsPanel from './components/LabelsPanel';
import BlueprintLabels from './components/BlueprintLabels';
import { updateLabel, resetLabels } from './app/labels';
import type { LabelMode } from './app/labels';
import type { BlueprintLabel } from './three/blueprintLabels';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import AngleBadge from './components/AngleBadge.tsx';
import Header from './components/Header.tsx';
import ConnectControls from './components/ConnectControls';
import AssemblyControls from './components/AssemblyControls';
import { createGroup, ungroup, toggleLock, selectPiece, motionIds } from './app/groups';
import {
  moveAssembly,
  rotateAssembly,
  selectionPose,
  hingeInfo,
  swingPiece,
} from './three/assemblyEdits';
import { fastenersAtPiece } from './app/connections';
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
import { alignedFastenerTargets, fastenStack } from './three/fastening';
import { sameHole } from './app/connections';
import { centerDesign, createPlacedPiece, removePlaced, setPiecesPosition } from './app/design';
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
  labelMode?: LabelMode;
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
  const libraryByIdRef = useRef(new Map<string, LibraryPiece>());
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
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
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
  const [printDialog, setPrintDialog] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printReport, setPrintReport] = useState<{
    name: string;
    date: string;
    view: PrintView;
    snapshot: PrintSnapshot;
    budget: PrintBudget;
  } | null>(null);
  const [labelsMove, setLabelsMove] = useState(false);
  const [blueprintLabels, setBlueprintLabels] = useState<readonly BlueprintLabel[]>([]);
  const [hingeMode, setHingeMode] = useState(false);
  const [snapHoles, setSnapHoles] = useState(true);
  const [alignedHoleCount, setAlignedHoleCount] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [fastening, setFastening] = useState(false);
  const idlePlacedRef = useRef(placed);
  const editStartPlacedRef = useRef(placed);
  const [firstHole, setFirstHole] = useState<readonly HoleRef[] | null>(null);
  const [holeTargets, setHoleTargets] = useState<readonly HoleTarget[]>([]);
  const [connectionOptions, setConnectionOptions] = useState(DEFAULT_CONNECTION_OPTIONS);
  const [retryHoles, setRetryHoles] = useState<{
    first: readonly HoleRef[];
    second: readonly HoleRef[];
  } | null>(null);
  const [pendingScrew, setPendingScrew] = useState<HoleRef | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  useEffect(() => {
    viewportRef.current?.setLabelsMode(activeDesign.labelMode ?? 'off');
  }, [activeDesign.labelMode, viewportReady]);
  const cancelConnection = useCallback(() => {
    idlePlacedRef.current = placedRef.current;
    setConnecting(false);
    setFastening(false);
    setFirstHole(null);
    setPendingScrew(null);
    dispatchHistory({ type: 'end-edit' });
  }, []);
  const stepHistory = useCallback(
    (type: 'undo' | 'redo') => {
      cancelConnection();
      idlePlacedRef.current = reduceDesignHistory(historyRef.current, { type }).present;
      dispatchHistory({ type });
    },
    [cancelConnection],
  );
  useEffect(() => {
    viewportRef.current?.setHoleMarkersEnabled(connecting || fastening, fastening ? 30 : 15);
  }, [connecting, fastening, viewportReady]);
  useEffect(() => {
    if (
      history.transactionStart !== null ||
      pendingScrew !== null ||
      idlePlacedRef.current === placed
    )
      return;
    const before = idlePlacedRef.current;
    idlePlacedRef.current = placed;
    // Reopening or replacing a design does not ask to change its saved connections.
    if (!before.some((piece) => placed.some((entry) => entry.id === piece.id))) return;
    const oldStock = new Map(
      before.filter((piece) => !piece.fastener).map((piece) => [piece.id, piece]),
    );
    const stockChanged = placed.some((piece) => {
      if (piece.fastener) return false;
      const old = oldStock.get(piece.id);
      return (
        !old ||
        (['x', 'y', 'z'] as const).some(
          (axis) =>
            piece.position[axis] !== old.position[axis] ||
            piece.rotation[axis] !== old.rotation[axis],
        )
      );
    });
    if (!stockChanged) return;
    const oldKeys = new Set(
      alignedFastenerTargets(before, libraryByIdRef.current, true).map((target) => target.key),
    );
    const target = alignedFastenerTargets(placed, libraryByIdRef.current, true).find(
      (entry) => !oldKeys.has(entry.key),
    );
    if (target && snapHoles) setPendingScrew(target.hole);
  }, [placed, history.transactionStart, pendingScrew, snapHoles]);
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
      stepHistory(event.shiftKey ? 'redo' : 'undo');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelConnection, stepHistory]);

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
    viewportRef.current?.setHingeEnabled(hingeMode);
  }, [hingeMode, viewportReady]);

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
          previous.some((piece) => piece.locked) ? previous : centerDesign(previous, sizeById),
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
    idlePlacedRef.current = [];
    clearRecoveryDraft(window.localStorage);
    setRecoveryDraft(null);
    setActiveDesign({ id: createDesignId(), name });
    dispatchHistory({ type: 'replace', placed: [] });
    setSelectedIds([]);
    setSelectionMode('move');
    setHingeMode(false);
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
    idlePlacedRef.current = design.placed;
    setActiveDesign({ id: design.id, name: design.name, labelMode: design.labelMode });
    dispatchHistory({ type: 'replace', placed: design.placed });
    setSelectedIds([]);
    setSelectionMode('move');
    setHingeMode(false);
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
    idlePlacedRef.current = recoveryDraft.placed;
    setActiveDesign({
      id: recoveryDraft.id,
      name: recoveryDraft.name,
      labelMode: recoveryDraft.labelMode,
    });
    dispatchHistory({ type: 'replace', placed: recoveryDraft.placed });
    setSelectedIds([]);
    setSelectionMode('move');
    setHingeMode(false);
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
      onBlueprintLabels: setBlueprintLabels,
      onHoleTargets: setHoleTargets,
      onAlignmentChange: setAlignedHoleCount,
      onBeginEdit(): void {
        editStartPlacedRef.current = placedRef.current;
        dragBaseHeights.current = new Map(
          placedRef.current.map((piece) => [piece.id, piece.position.y]),
        );
        dispatchHistory({ type: 'begin-edit' });
      },
      onEndEdit(allowPrompt = true): void {
        const after = placedRef.current;
        idlePlacedRef.current = after;
        const oldKeys = new Set(
          alignedFastenerTargets(editStartPlacedRef.current, libraryByIdRef.current, true).map(
            (target) => target.key,
          ),
        );
        const target = allowPrompt
          ? alignedFastenerTargets(after, libraryByIdRef.current, true).find(
              (entry) => !oldKeys.has(entry.key),
            )
          : undefined;
        if (target) setPendingScrew(target.hole);
        else dispatchHistory({ type: 'end-edit' });
      },
      onSelectPiece(placedId: string, additive: boolean): void {
        setSelectedIds((previous) => selectPiece(placedRef.current, previous, placedId, additive));
        // Selecting keeps the current mode and the piece's rotation.
      },
      onDeselectAll(): void {
        setHingeMode(false);
        setSelectedIds([]);
        setBadgeAxis(null);
      },
      onDragPiece(placedId: string, x: number, z: number, y?: number): void {
        dispatchHistory({
          type: 'edit',
          apply: (previous) => {
            const piece = previous.find((entry) => entry.id === placedId);
            if (!piece || piece.locked) return previous;
            if (motionIds(previous, [placedId]).size > 1) {
              const pose = selectionPose(previous, [placedId], libraryByIdRef.current)!;
              return moveAssembly(
                previous,
                [placedId],
                { x, y: pose.position.y, z },
                libraryByIdRef.current,
                true,
              );
            }
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
      canMovePiece(id): boolean {
        const members = motionIds(placedRef.current, [id]);
        return !placedRef.current.some((piece) => members.has(piece.id) && piece.locked);
      },
      hingeInfo(id) {
        return hingeInfo(placedRef.current, id, libraryByIdRef.current);
      },
      onHingeAngle(id, angle): void {
        dispatchHistory({
          type: 'edit',
          apply: (previous) => {
            const next = swingPiece(editStartPlacedRef.current, id, angle, libraryByIdRef.current);
            return next === editStartPlacedRef.current ? previous : next;
          },
        });
      },
      onRotatePiece(placedId: string, axis: RotationAxis, angleDeg: number): void {
        dispatchHistory({
          type: 'edit',
          apply: (previous) => {
            const before = editStartPlacedRef.current;
            const pose = selectionPose(before, [placedId], libraryByIdRef.current);
            if (!pose) return previous;
            const next = rotateAssembly(
              before,
              [placedId],
              { ...pose.rotation, [axis]: angleDeg },
              libraryByIdRef.current,
            );
            return next === before && angleDeg !== pose.rotation[axis] ? previous : next;
          },
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
      setHingeMode(false);
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
          if (single === undefined || single.locked) {
            return previous;
          }
          const pose = selectionPose(previous, selectedIds, libraryByIdRef.current);
          if (pose && motionIds(previous, selectedIds).size > 1)
            return moveAssembly(
              previous,
              selectedIds,
              { ...pose.position, [axis]: value },
              libraryByIdRef.current,
            );
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

  const setAngleSelected = useCallback(
    (axis: RotationAxis, degrees: number, relative = false) => {
      dispatchHistory({
        type: 'edit',
        apply: (previous) => {
          const pose = selectionPose(previous, selectedIds, libraryByIdRef.current);
          return pose
            ? rotateAssembly(
                previous,
                selectedIds,
                { ...pose.rotation, [axis]: relative ? pose.rotation[axis] + degrees : degrees },
                libraryByIdRef.current,
              )
            : previous;
        },
      });
    },
    [selectedIds],
  );
  const rotateStepSelected = useCallback(
    (axis: RotationAxis, direction: 1 | -1) => setAngleSelected(axis, direction * rotateStep, true),
    [setAngleSelected, rotateStep],
  );
  const flipSelected = useCallback(
    (axis: RotationAxis) => setAngleSelected(axis, 180, true),
    [setAngleSelected],
  );
  const rotate90Selected = useCallback(
    (axis: RotationAxis) => setAngleSelected(axis, 90, true),
    [setAngleSelected],
  );
  const resetOrientationSelected = useCallback(() => {
    dispatchHistory({
      type: 'edit',
      apply: (previous) =>
        rotateAssembly(previous, selectedIds, { x: 0, y: 0, z: 0 }, libraryByIdRef.current),
    });
  }, [selectedIds]);
  const setAngleForPiece = useCallback((id: string, axis: RotationAxis, degrees: number) => {
    dispatchHistory({
      type: 'edit',
      apply: (previous) => {
        const pose = selectionPose(previous, [id], libraryByIdRef.current);
        return pose
          ? rotateAssembly(
              previous,
              [id],
              { ...pose.rotation, [axis]: degrees },
              libraryByIdRef.current,
            )
          : previous;
      },
    });
  }, []);
  const setHingeAngle = useCallback(
    (angle: number) => {
      if (selectedIds.length !== 1) return;
      dispatchHistory({
        type: 'edit',
        apply: (previous) => swingPiece(previous, selectedIds[0]!, angle, libraryByIdRef.current),
      });
    },
    [selectedIds],
  );
  const handleSetMode = useCallback((mode: SelectionMode) => {
    setSelectionMode(mode);
    setHingeMode(false);
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
    setHingeMode(false);
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

  const fastenerTargets = useMemo(
    () => alignedFastenerTargets(placed, new Map(libraryPieces.map((piece) => [piece.id, piece]))),
    [placed, libraryPieces],
  );
  const pickFastener = (members: readonly HoleRef[]) => {
    const target = fastenerTargets.find((entry) =>
      members.some((hole) => sameHole(hole, entry.hole)),
    );
    if (target) {
      const next = fastenStack(
        placed,
        libraryByIdRef.current,
        target.hole,
        `fastener-${createDesignId()}`,
        true,
      );
      if (next) dispatchHistory({ type: 'edit', apply: () => next });
      else
        setConnectionNotice(
          'No fastener could be placed above the workplane. Raise or unlock the stack and retry.',
        );
    }
    cancelConnection();
  };

  const selected = placed.filter((piece) => selectedIds.includes(piece.id));
  const renderLibrary = new Map(libraryPieces.map((piece) => [piece.id, piece]));
  const pose = selectionPose(placed, selectedIds, renderLibrary);
  const singleSelected: SingleSelection | null =
    selected.length && (selected.length === 1 || pose?.groupId) && pose
      ? {
          id: selected[0]!.id,
          name: pose.groupId
            ? `Group · ${selected.length} items`
            : selected[0]!.fastener
              ? fastenerName(selected[0]!.fastener!)
              : (libraryPieces.find((piece) => piece.id === selected[0]!.libraryId)?.name ??
                'Piece'),
          position: pose.position,
          rotation: pose.rotation,
          locked: placed.some(
            (piece) => motionIds(placed, selectedIds).has(piece.id) && piece.locked,
          ),
          hinge:
            selected.length === 1 &&
            !selected[0]!.fastener &&
            fastenersAtPiece(placed, selected[0]!.id).length > 0
              ? {
                  angle: selected[0]!.hingeAngleDeg ?? 0,
                  available: hingeInfo(placed, selected[0]!.id, renderLibrary) !== null,
                }
              : undefined,
        }
      : null;

  return (
    <div className="app">
      <Header
        tools={
          <div className="header-tools">
            <AssemblyControls
              canGroup={selected.length >= 2 && !pose?.groupId}
              canUngroup={selected.some((piece) => piece.groupId)}
              canLock={selected.length > 0}
              locked={selected.length > 0 && selected.every((piece) => piece.locked)}
              onGroup={() => {
                const groupId = `group-${createDesignId()}`;
                const next = createGroup(placed, selectedIds, groupId);
                cancelConnection();
                setHingeMode(false);
                dispatchHistory({ type: 'edit', apply: () => next });
                setSelectedIds(
                  next.filter((piece) => piece.groupId === groupId).map((piece) => piece.id),
                );
              }}
              onUngroup={() => {
                cancelConnection();
                setHingeMode(false);
                dispatchHistory({
                  type: 'edit',
                  apply: (previous) => ungroup(previous, selectedIds),
                });
              }}
              onLock={() => {
                cancelConnection();
                dispatchHistory({
                  type: 'edit',
                  apply: (previous) => toggleLock(previous, selectedIds),
                });
              }}
            />
            <ConnectControls
              active={connecting}
              disabled={
                placed.filter((piece) => !piece.fastener).length < 2 || pendingScrew !== null
              }
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
          </div>
        }
        designName={activeDesign.name || 'Name this design'}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        saveStatus={saveStatus}
        onRename={() => showDialog('rename')}
        onUndo={() => {
          stepHistory('undo');
        }}
        onRedo={() => {
          stepHistory('redo');
        }}
        onSave={saveActiveDesign}
        onOpen={() => showDialog('open')}
        onNew={() => showDialog('new')}
        onManage={() => showDialog('manage')}
        canPrint={viewportReady && placed.length > 0}
        onPrint={() => {
          cancelConnection();
          setPrintError(null);
          setPrintDialog(true);
        }}
      />
      <main className="app-main">
        <ViewControls
          currentView={currentView}
          onSelectView={selectView}
          onZoomIn={() => viewportRef.current?.zoomIn()}
          onZoomOut={() => viewportRef.current?.zoomOut()}
          onFit={fit}
          disabled={!viewportReady}
          selectedCount={selected.length}
          onRemoveSelected={removeSelected}
          hasPieces={placed.length > 0 && !placed.some((piece) => piece.locked)}
          onCenterProject={centerProject}
          snapHoles={snapHoles}
          alignedHoleCount={alignedHoleCount}
          onSnapHolesChange={setSnapHoles}
          fastening={fastening}
          canFasten={fastenerTargets.length > 0 && pendingScrew === null}
          onFasten={() => {
            cancelConnection();
            setFastening(!fastening);
            if (!fastenerTargets.length)
              setConnectionNotice('No empty aligned holes. Align two to four layers first.');
          }}
        />
        <div className="viewport-wrap">
          <Viewport onReady={onViewportReady} designCallbacks={designCallbacks} />
          <BlueprintLabels
            labels={blueprintLabels}
            move={labelsMove && !connecting && !fastening}
            onBegin={() => dispatchHistory({ type: 'begin-edit' })}
            onEnd={() => dispatchHistory({ type: 'end-edit' })}
            onMove={(id, offset) =>
              dispatchHistory({
                type: 'edit',
                apply: (previous) => updateLabel(previous, id, { offset }),
              })
            }
          />
          {connecting && <HolePicker targets={holeTargets} first={firstHole} onPick={pickHole} />}
          {fastening && (
            <HolePicker
              fastener
              targets={holeTargets.filter(
                (target) =>
                  !target.occupied &&
                  target.members.some((hole) =>
                    fastenerTargets.some((entry) => sameHole(hole, entry.hole)),
                  ),
              )}
              first={null}
              onPick={pickFastener}
            />
          )}
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
          {!connecting && !fastening && (
            <MoveRotatePanel
              key={singleSelected?.id ?? `multi-${selectedIds.length}`}
              single={singleSelected}
              selectedCount={selected.length}
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
              hingeMode={hingeMode}
              onHingeMode={() => {
                setHingeMode(true);
                setBadgeAxis(null);
              }}
              onHingeAngle={setHingeAngle}
            />
          )}
          {!connecting &&
            !fastening &&
            badgeAxis !== null &&
            selectionMode === 'rotate' &&
            !hingeMode &&
            selectedIds.includes(badgeAxis.placedId) &&
            (() => {
              const piece = placed.find((entry) => entry.id === badgeAxis.placedId);
              if (piece === undefined) {
                return null;
              }
              return (
                <AngleBadge
                  axis={badgeAxis.axis}
                  angle={(piece.groupRotation ?? piece.rotation)[badgeAxis.axis]}
                  onSetAngle={(axis, degrees) => {
                    setAngleForPiece(badgeAxis.placedId, axis, degrees);
                  }}
                />
              );
            })()}
        </div>
        <ShapesPanel
          labelsPanel={
            <LabelsPanel
              mode={activeDesign.labelMode ?? 'off'}
              move={labelsMove}
              pieces={placed.map((piece) => ({
                id: piece.id,
                name: piece.fastener
                  ? fastenerName(piece.fastener)
                  : (libraryPieces.find((entry) => entry.id === piece.libraryId)?.name ?? 'Piece'),
                hidden: piece.label?.hidden ?? false,
              }))}
              onMode={(labelMode) => setActiveDesign((previous) => ({ ...previous, labelMode }))}
              onMove={setLabelsMove}
              onVisible={(id, visible) =>
                dispatchHistory({
                  type: 'edit',
                  apply: (previous) => updateLabel(previous, id, { hidden: !visible }),
                })
              }
              onReset={() => dispatchHistory({ type: 'edit', apply: resetLabels })}
            />
          }
          pieces={libraryPieces}
          onImport={onImport}
          importing={importing}
          importError={importError}
          onPlace={placePiece}
        />
      </main>
      {printDialog && (
        <PrintViewDialog
          error={printError}
          busy={printBusy}
          onClose={() => setPrintDialog(false)}
          onPreview={(view) => {
            setPrintBusy(true);
            void import('./three/printSnapshot')
              .then(({ renderPrintSnapshot }) => {
                const library = new Map(libraryPieces.map((piece) => [piece.id, piece]));
                const snapshot = renderPrintSnapshot(
                  placed,
                  library,
                  view,
                  activeDesign.labelMode ?? 'off',
                );
                setPrintReport({
                  name: activeDesign.name,
                  date: new Intl.DateTimeFormat(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }).format(new Date()),
                  view,
                  snapshot,
                  budget: printBudget(placed, library),
                });
                setPrintDialog(false);
              })
              .catch((error: unknown) =>
                setPrintError(
                  error instanceof Error ? error.message : 'Could not prepare the print preview.',
                ),
              )
              .finally(() => setPrintBusy(false));
          }}
        />
      )}
      {printReport && (
        <PrintReport
          {...printReport}
          onClose={() => setPrintReport(null)}
          onChangeView={() => {
            setPrintReport(null);
            setPrintDialog(true);
          }}
        />
      )}
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

import type { PlacedPiece } from './design';

export const DESIGN_HISTORY_LIMIT = 100;

export interface DesignHistory {
  present: readonly PlacedPiece[];
  past: readonly (readonly PlacedPiece[])[];
  future: readonly (readonly PlacedPiece[])[];
  transactionStart: readonly PlacedPiece[] | null;
}

export type DesignHistoryAction =
  | { type: 'edit'; apply: (placed: readonly PlacedPiece[]) => readonly PlacedPiece[] }
  | { type: 'begin-edit' }
  | { type: 'end-edit' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; placed: readonly PlacedPiece[] };

export function createDesignHistory(placed: readonly PlacedPiece[] = []): DesignHistory {
  return { present: placed, past: [], future: [], transactionStart: null };
}

function pushSnapshot(
  snapshots: readonly (readonly PlacedPiece[])[],
  snapshot: readonly PlacedPiece[],
): readonly (readonly PlacedPiece[])[] {
  return [...snapshots, snapshot].slice(-DESIGN_HISTORY_LIMIT);
}

export function reduceDesignHistory(
  state: DesignHistory,
  action: DesignHistoryAction,
): DesignHistory {
  switch (action.type) {
    case 'edit': {
      const next = action.apply(state.present);
      if (next === state.present) {
        return state;
      }
      if (state.transactionStart !== null) {
        return { ...state, present: next };
      }
      return {
        present: next,
        past: pushSnapshot(state.past, state.present),
        future: [],
        transactionStart: null,
      };
    }
    case 'begin-edit':
      return state.transactionStart === null
        ? { ...state, transactionStart: state.present }
        : state;
    case 'end-edit':
      if (state.transactionStart === null) {
        return state;
      }
      return state.transactionStart === state.present
        ? { ...state, transactionStart: null }
        : {
            ...state,
            past: pushSnapshot(state.past, state.transactionStart),
            future: [],
            transactionStart: null,
          };
    case 'undo': {
      const ended = reduceDesignHistory(state, { type: 'end-edit' });
      const previous = ended.past.at(-1);
      if (previous === undefined) {
        return ended;
      }
      return {
        present: previous,
        past: ended.past.slice(0, -1),
        future: [ended.present, ...ended.future].slice(0, DESIGN_HISTORY_LIMIT),
        transactionStart: null,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (next === undefined) {
        return state;
      }
      return {
        present: next,
        past: pushSnapshot(state.past, state.present),
        future: state.future.slice(1),
        transactionStart: null,
      };
    }
    case 'replace':
      return createDesignHistory(action.placed);
  }
}

export function canUndo(history: DesignHistory): boolean {
  return history.past.length > 0 || history.transactionStart !== null;
}

export function canRedo(history: DesignHistory): boolean {
  return history.future.length > 0;
}

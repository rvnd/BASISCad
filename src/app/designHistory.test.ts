import { describe, expect, it } from 'vitest';
import { createDesignHistory, reduceDesignHistory } from './designHistory';
import type { PlacedPiece } from './design';

function piece(x: number): PlacedPiece {
  return {
    id: 'p1',
    libraryId: 'girder',
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  };
}

describe('design history', () => {
  it('undoes and redoes edits, and clears redo after a new edit', () => {
    let history = createDesignHistory([piece(0)]);
    history = reduceDesignHistory(history, { type: 'edit', apply: () => [piece(10)] });
    history = reduceDesignHistory(history, { type: 'undo' });
    expect(history.present[0]?.position.x).toBe(0);
    history = reduceDesignHistory(history, { type: 'redo' });
    expect(history.present[0]?.position.x).toBe(10);
    history = reduceDesignHistory(history, { type: 'undo' });
    history = reduceDesignHistory(history, { type: 'edit', apply: () => [piece(20)] });
    expect(history.future).toHaveLength(0);
  });

  it('coalesces many pointer updates into one undo step', () => {
    let history = createDesignHistory([piece(0)]);
    history = reduceDesignHistory(history, { type: 'begin-edit' });
    history = reduceDesignHistory(history, { type: 'edit', apply: () => [piece(5)] });
    history = reduceDesignHistory(history, { type: 'edit', apply: () => [piece(10)] });
    history = reduceDesignHistory(history, { type: 'end-edit' });
    expect(history.past).toHaveLength(1);
    history = reduceDesignHistory(history, { type: 'undo' });
    expect(history.present[0]?.position.x).toBe(0);
  });

  it('does not add a history step for an edit transaction with no changes', () => {
    let history = createDesignHistory([piece(0)]);
    history = reduceDesignHistory(history, { type: 'begin-edit' });
    history = reduceDesignHistory(history, { type: 'end-edit' });
    expect(history.past).toHaveLength(0);
  });

  it('keeps the most recent 100 edits', () => {
    let history = createDesignHistory([piece(0)]);
    for (let x = 1; x <= 101; x += 1) {
      history = reduceDesignHistory(history, { type: 'edit', apply: () => [piece(x)] });
    }
    expect(history.past).toHaveLength(100);
    for (let step = 0; step < 100; step += 1) {
      history = reduceDesignHistory(history, { type: 'undo' });
    }
    expect(history.present[0]?.position.x).toBe(1);
    expect(reduceDesignHistory(history, { type: 'undo' })).toBe(history);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addPendingFirstOpenBoard,
  clearPendingFirstOpenBoard,
  getPendingFirstOpenBoardIds,
} from './boardFirstOpenHighlight';

const KEY = 'worksheet-ai-board-pending-first-open';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('boardFirstOpenHighlight', () => {
  it('liefert leeres Array wenn nichts gespeichert', () => {
    expect(getPendingFirstOpenBoardIds()).toEqual([]);
  });

  it('schreibt + liest IDs', () => {
    addPendingFirstOpenBoard('a');
    addPendingFirstOpenBoard('b');
    const ids = getPendingFirstOpenBoardIds();
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('dedupliziert dieselbe ID', () => {
    addPendingFirstOpenBoard('a');
    addPendingFirstOpenBoard('a');
    expect(getPendingFirstOpenBoardIds()).toEqual(['a']);
  });

  it('clearPendingFirstOpenBoard entfernt nur das gewählte Item', () => {
    addPendingFirstOpenBoard('a');
    addPendingFirstOpenBoard('b');
    clearPendingFirstOpenBoard('a');
    expect(getPendingFirstOpenBoardIds()).toEqual(['b']);
  });

  it('clear ohne Match ist no-op', () => {
    addPendingFirstOpenBoard('a');
    clearPendingFirstOpenBoard('zzz');
    expect(getPendingFirstOpenBoardIds()).toEqual(['a']);
  });

  it('toleriert kaputten JSON-Inhalt', () => {
    localStorage.setItem(KEY, '{nicht-json}');
    expect(getPendingFirstOpenBoardIds()).toEqual([]);
  });

  it('toleriert nicht-Array JSON', () => {
    localStorage.setItem(KEY, '{"x":1}');
    expect(getPendingFirstOpenBoardIds()).toEqual([]);
  });

  it('filtert non-string-Einträge raus', () => {
    localStorage.setItem(KEY, JSON.stringify(['a', 1, null, 'b']));
    expect(getPendingFirstOpenBoardIds()).toEqual(['a', 'b']);
  });
});

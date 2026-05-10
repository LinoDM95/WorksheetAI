import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addPendingFirstOpenWorksheet,
  clearPendingFirstOpenWorksheet,
  getPendingFirstOpenWorksheetIds,
} from './worksheetFirstOpenHighlight';

const KEY = 'worksheet-ai-worksheet-pending-first-open';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('worksheetFirstOpenHighlight', () => {
  it('liefert leeres Array initial', () => {
    expect(getPendingFirstOpenWorksheetIds()).toEqual([]);
  });

  it('add + read', () => {
    addPendingFirstOpenWorksheet('w1');
    addPendingFirstOpenWorksheet('w2');
    expect(new Set(getPendingFirstOpenWorksheetIds())).toEqual(new Set(['w1', 'w2']));
  });

  it('dedupliziert', () => {
    addPendingFirstOpenWorksheet('w1');
    addPendingFirstOpenWorksheet('w1');
    expect(getPendingFirstOpenWorksheetIds()).toEqual(['w1']);
  });

  it('clear entfernt einzelnes Item', () => {
    addPendingFirstOpenWorksheet('w1');
    addPendingFirstOpenWorksheet('w2');
    clearPendingFirstOpenWorksheet('w1');
    expect(getPendingFirstOpenWorksheetIds()).toEqual(['w2']);
  });

  it('clear no-op wenn ID fehlt', () => {
    addPendingFirstOpenWorksheet('w1');
    clearPendingFirstOpenWorksheet('w999');
    expect(getPendingFirstOpenWorksheetIds()).toEqual(['w1']);
  });

  it('toleriert kaputten JSON-Inhalt', () => {
    localStorage.setItem(KEY, 'kaputt');
    expect(getPendingFirstOpenWorksheetIds()).toEqual([]);
  });

  it('filtert non-string-Einträge raus', () => {
    localStorage.setItem(KEY, JSON.stringify(['a', 42, true, 'b']));
    expect(getPendingFirstOpenWorksheetIds()).toEqual(['a', 'b']);
  });
});

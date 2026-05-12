import { describe, expect, it } from 'vitest';
import {
  BOARD_LIBRARY_TECH_FILTER_IDS,
  LIBRARY_TECH_LABELS,
} from './boardLibraryLabels';

describe('boardLibraryLabels', () => {
  it('hat eindeutige LibraryIds in der Filterliste', () => {
    const set = new Set(BOARD_LIBRARY_TECH_FILTER_IDS);
    expect(set.size).toBe(BOARD_LIBRARY_TECH_FILTER_IDS.length);
  });

  it('liefert für jede LibraryId in BOARD_LIBRARY_TECH_FILTER_IDS auch ein Label', () => {
    for (const id of BOARD_LIBRARY_TECH_FILTER_IDS) {
      expect(LIBRARY_TECH_LABELS[id]).toBeTruthy();
      expect(typeof LIBRARY_TECH_LABELS[id]).toBe('string');
    }
  });

  it('Labels sind nicht-leere Strings', () => {
    for (const [id, label] of Object.entries(LIBRARY_TECH_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('hat stabile Reihenfolge (Alphabetisch nach ID außer turf am Ende)', () => {
    const expected = [
      'chartjs',
      'confetti',
      'd3',
      'gsap',
      'howler',
      'interactjs',
      'konva',
      'leaflet',
      'matterjs',
      'phaser',
      'pixi',
      'roughjs',
      'topojson',
      'turf',
    ];
    expect(BOARD_LIBRARY_TECH_FILTER_IDS).toEqual(expected);
  });

  it('LIBRARY_TECH_LABELS deckt alle 14 LibraryIds ab', () => {
    expect(Object.keys(LIBRARY_TECH_LABELS).sort()).toEqual([...BOARD_LIBRARY_TECH_FILTER_IDS].sort());
  });

  it('keine Doppel-Labels (Eindeutigkeit der Anzeigen)', () => {
    const labels = Object.values(LIBRARY_TECH_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

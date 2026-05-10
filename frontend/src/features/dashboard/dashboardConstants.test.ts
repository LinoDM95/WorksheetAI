import { describe, expect, it } from 'vitest';
import type { BoardLibraryItem } from '../boards/types';
import {
  FALLBACK_ACCENT,
  FALLBACK_SUBJECT_CHIPS,
  SEASONAL_KEYWORDS_BY_MONTH,
  SUBJECT_ACCENTS,
  greetingByHour,
  matchesAnyKeyword,
  popularityScore,
  subjectAccent,
} from './dashboardConstants';

const baseItem: BoardLibraryItem = {
  id: 'b',
  title: '',
  subject: '',
  grade: '',
  topic: '',
  description: '',
} as unknown as BoardLibraryItem;

describe('greetingByHour', () => {
  it('Nacht (<5)', () => {
    expect(greetingByHour(0)).toBe('Schöne Nacht');
    expect(greetingByHour(4)).toBe('Schöne Nacht');
  });
  it('Morgen (5–10)', () => {
    expect(greetingByHour(5)).toBe('Guten Morgen');
    expect(greetingByHour(10)).toBe('Guten Morgen');
  });
  it('Mittag (11–13)', () => {
    expect(greetingByHour(11)).toBe('Hallo');
    expect(greetingByHour(13)).toBe('Hallo');
  });
  it('Nachmittag (14–17)', () => {
    expect(greetingByHour(14)).toBe('Schönen Nachmittag');
    expect(greetingByHour(17)).toBe('Schönen Nachmittag');
  });
  it('Abend (>=18)', () => {
    expect(greetingByHour(18)).toBe('Guten Abend');
    expect(greetingByHour(23)).toBe('Guten Abend');
  });
});

describe('SEASONAL_KEYWORDS_BY_MONTH', () => {
  it('hat Einträge für alle 12 Monate', () => {
    for (let m = 1; m <= 12; m++) {
      const e = SEASONAL_KEYWORDS_BY_MONTH[m];
      expect(e).toBeDefined();
      expect(e.label).toBeTruthy();
      expect(e.keywords.length).toBeGreaterThan(0);
    }
  });

  it('Dezember enthält Weihnachten', () => {
    expect(SEASONAL_KEYWORDS_BY_MONTH[12].keywords).toContain('weihnachten');
  });
});

describe('popularityScore', () => {
  it('0 wenn keine Bewertung vorhanden', () => {
    expect(popularityScore(baseItem)).toBe(0);
  });

  it('rating × log(1+count)', () => {
    const it1: BoardLibraryItem = { ...baseItem, avg_rating: 5, rating_count: 0 };
    expect(popularityScore(it1)).toBe(5 * Math.log(1));

    const it2: BoardLibraryItem = { ...baseItem, avg_rating: 4, rating_count: 99 };
    expect(popularityScore(it2)).toBeCloseTo(4 * Math.log(100), 5);
  });

  it('mehr Stimmen schlagen 1×5,0', () => {
    const single5 = popularityScore({ ...baseItem, avg_rating: 5, rating_count: 1 });
    const consensus = popularityScore({ ...baseItem, avg_rating: 4.0, rating_count: 50 });
    expect(consensus).toBeGreaterThan(single5);
  });
});

describe('matchesAnyKeyword', () => {
  it('matcht in title (case-insensitive)', () => {
    const it: BoardLibraryItem = { ...baseItem, title: 'Frühling im Wald' };
    expect(matchesAnyKeyword(it, ['frühling'])).toBe(true);
    expect(matchesAnyKeyword(it, ['FRÜHLING'])).toBe(true);
  });

  it('matcht in description', () => {
    const it: BoardLibraryItem = { ...baseItem, description: 'Ostern-Spezial' };
    expect(matchesAnyKeyword(it, ['ostern'])).toBe(true);
  });

  it('false bei keinem Match', () => {
    const it: BoardLibraryItem = { ...baseItem, title: 'foo' };
    expect(matchesAnyKeyword(it, ['bar'])).toBe(false);
  });

  it('false bei leerer Keyword-Liste', () => {
    expect(matchesAnyKeyword(baseItem, [])).toBe(false);
  });
});

describe('subjectAccent / FALLBACK_*', () => {
  it('hat eine Akzentfarbe für jedes Default-Chip-Fach', () => {
    for (const subj of FALLBACK_SUBJECT_CHIPS) {
      // Default chips müssen existieren oder Fallback liefern, aber für die Top-Fächer sollte SUBJECT_ACCENTS greifen
      const a = subjectAccent(subj);
      expect(a.bg).toBeTruthy();
      expect(a.fg).toBeTruthy();
      expect(a.pill).toBeTruthy();
    }
  });

  it('liefert FALLBACK bei unbekanntem Fach', () => {
    expect(subjectAccent('Nonsense-Fach-XYZ')).toEqual(FALLBACK_ACCENT);
  });

  it('verwendet kanonisches Mapping (Mathematik → indigo)', () => {
    expect(SUBJECT_ACCENTS.Mathematik.bg).toContain('indigo');
  });
});

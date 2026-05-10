/**
 * @vitest-environment jsdom
 *
 * Wir testen die Hook-Logik durch synchrones Aufrufen der Hook-Funktion in
 * einem react-renderer. Da `@testing-library/react` hier nicht installiert ist,
 * verwenden wir ReactDOMTestUtils.act + ein simpler test-renderer.
 *
 * Alternativ: Logik-Test über die exponierten reinen Funktionen aus
 * dashboardConstants. Hier minimaler Setup ohne externe Renderer.
 */
import { describe, expect, it } from 'vitest';
import { matchesAnyKeyword, popularityScore } from './dashboardConstants';
import type { BoardLibraryItem } from '../boards/types';

const mkLib = (over: Partial<BoardLibraryItem> = {}): BoardLibraryItem =>
  ({
    id: 'l',
    title: '',
    subject: '',
    grade: '',
    topic: '',
    description: '',
    library_published_at: '2026-01-01T00:00:00.000Z',
    avg_rating: null,
    rating_count: null,
    ...over,
  }) as unknown as BoardLibraryItem;

/**
 * Reine Reproduktion der Sortier-/Filter-Logik aus useDashboardDerived,
 * damit wir sie testen können ohne React-Renderer (kein @testing-library/react
 * im Projekt). Die Logik MUSS 1:1 zur Hook bleiben.
 */
const newestLibrary = (lib: BoardLibraryItem[]) =>
  [...lib]
    .sort((a, b) => {
      const ta = a.library_published_at ? Date.parse(a.library_published_at) : 0;
      const tb = b.library_published_at ? Date.parse(b.library_published_at) : 0;
      return tb - ta;
    })
    .slice(0, 12);

const popularLibrary = (lib: BoardLibraryItem[]) =>
  [...lib]
    .filter((b) => (b.rating_count ?? 0) > 0)
    .sort((a, b) => popularityScore(b) - popularityScore(a))
    .slice(0, 12);

const seasonalLibrary = (lib: BoardLibraryItem[], keys: string[]) =>
  lib.filter((b) => matchesAnyKeyword(b, keys)).slice(0, 12);

describe('useDashboardDerived (Logik-Reproduktion)', () => {
  it('newestLibrary sortiert nach library_published_at desc', () => {
    const lib = [
      mkLib({ id: 'l1', library_published_at: '2025-01-01T00:00:00.000Z' }),
      mkLib({ id: 'l2', library_published_at: '2026-06-01T00:00:00.000Z' }),
    ];
    expect(newestLibrary(lib)[0].id).toBe('l2');
  });

  it('popularLibrary filtert ohne rating_count und sortiert nach Score', () => {
    const lib = [
      mkLib({ id: 'l_zero', avg_rating: 5, rating_count: 0 }),
      mkLib({ id: 'l_top', avg_rating: 4, rating_count: 100 }),
      mkLib({ id: 'l_low', avg_rating: 5, rating_count: 1 }),
    ];
    const out = popularLibrary(lib);
    expect(out.find((l) => l.id === 'l_zero')).toBeUndefined();
    expect(out[0].id).toBe('l_top');
  });

  it('seasonalLibrary filtert per matchesAnyKeyword', () => {
    const lib = [
      mkLib({ id: 'l1', title: 'Frühling im Wald' }),
      mkLib({ id: 'l2', title: 'Mathe' }),
    ];
    const out = seasonalLibrary(lib, ['frühling']);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('l1');
  });

  it('newestLibrary begrenzt auf 12', () => {
    const lib = Array.from({ length: 20 }, (_, i) =>
      mkLib({ id: `l${i}`, library_published_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    expect(newestLibrary(lib).length).toBe(12);
  });
});

import { useMemo } from 'react';
import type { BoardLibraryItem, BoardListItem } from '../boards/types';
import { canonicalSubjectLabel } from '../boards/lib/libraryCatalogFilters';
import {
  FALLBACK_SUBJECT_CHIPS,
  matchesAnyKeyword,
  popularityScore,
} from './dashboardConstants';
import type { ContinueItem, RecentWorksheet } from './dashboardTypes';

export const useDashboardDerived = (
  boardsData: BoardListItem[] | undefined,
  wsData: RecentWorksheet[] | undefined,
  libraryData: BoardLibraryItem[],
  seasonal: { label: string; keywords: string[] } | undefined,
) => {
  const continueItems = useMemo<ContinueItem[]>(() => {
    const items: ContinueItem[] = [];
    for (const b of boardsData ?? []) {
      items.push({
        kind: 'board',
        id: b.id,
        title: b.title,
        subject: b.subject,
        grade: b.grade,
        topic: b.topic,
        updated_at: b.updated_at,
        libraries: b.used_libraries,
      });
    }
    for (const w of wsData ?? []) {
      items.push({
        kind: 'worksheet',
        id: w.id,
        title: w.title,
        subject: w.subject,
        grade: w.grade,
        status: w.status,
        updated_at: w.updated_at,
      });
    }
    items.sort((a, b) => {
      const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
      const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
      return tb - ta;
    });
    return items.slice(0, 12);
  }, [boardsData, wsData]);

  const newestLibrary = useMemo(() => {
    return [...libraryData]
      .sort((a, b) => {
        const ta = a.library_published_at ? Date.parse(a.library_published_at) : 0;
        const tb = b.library_published_at ? Date.parse(b.library_published_at) : 0;
        return tb - ta;
      })
      .slice(0, 12);
  }, [libraryData]);

  const popularLibrary = useMemo(() => {
    return [...libraryData]
      .filter((b) => (b.rating_count ?? 0) > 0)
      .sort((a, b) => popularityScore(b) - popularityScore(a))
      .slice(0, 12);
  }, [libraryData]);

  const seasonalLibrary = useMemo(() => {
    if (!seasonal) return [];
    return libraryData.filter((b) => matchesAnyKeyword(b, seasonal.keywords)).slice(0, 12);
  }, [libraryData, seasonal]);

  const subjectChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of libraryData) {
      const k = canonicalSubjectLabel(b.subject);
      if (!k || k === 'Andere') continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return FALLBACK_SUBJECT_CHIPS.map((s) => ({ label: s, count: 0 }));
    return sorted.slice(0, 12).map(([label, count]) => ({ label, count }));
  }, [libraryData]);

  const userTopSubject = useMemo(() => {
    const counts = new Map<string, number>();
    const tally = (s?: string) => {
      if (!s) return;
      const k = canonicalSubjectLabel(s);
      if (!k || k === 'Andere') return;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    };
    for (const b of boardsData ?? []) tally(b.subject);
    for (const w of wsData ?? []) tally(w.subject);
    let best: string | null = null;
    let bestN = 0;
    for (const [k, n] of counts.entries()) if (n > bestN) [best, bestN] = [k, n];
    return best;
  }, [boardsData, wsData]);

  const userSubjectLibrary = useMemo(() => {
    if (!userTopSubject) return [];
    return libraryData
      .filter((b) => canonicalSubjectLabel(b.subject) === userTopSubject)
      .slice(0, 12);
  }, [libraryData, userTopSubject]);

  return {
    continueItems,
    newestLibrary,
    popularLibrary,
    seasonalLibrary,
    subjectChips,
    userTopSubject,
    userSubjectLibrary,
  };
};

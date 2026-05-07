import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, FileText, MessageCircle, SlidersHorizontal, Star } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  IconButton,
  SearchInput,
} from '../../../components/ui';
import { cn } from '../../../lib/cn';
import {
  boardsLibraryQueryKey,
  fetchWorksheetLibrary,
  worksheetsLibraryQueryKey,
  type BoardLibraryScope,
} from '../../../lib/listQueries';
import { fetchBoardLibrary } from '../boardsApi';
import {
  BOARD_LIBRARY_TECH_FILTER_IDS,
  LIBRARY_TECH_LABELS,
} from '../lib/boardLibraryLabels';
import {
  canonicalSubjectLabel,
  LIBRARY_GRADE_STEPS,
  matchesLibraryGradeFilter,
  matchesLibraryPurpose,
  matchesLibrarySubjectFilter,
  uniqueCanonicalSubjectLabelsFromRows,
  type LibraryPurposeFilter,
} from '../lib/libraryCatalogFilters';
import { BoardLibraryThumbnail } from '../components/library/BoardLibraryThumbnail';
import { LibraryPlannedDuration } from '../components/library/LibraryPlannedDuration';
import { LibrarySubjectChipsScrollBar } from '../components/library/LibrarySubjectChipsScrollBar';
import type { BoardLibraryItem, LibraryId } from '../types';
import type { WorksheetLibraryItem } from '../../../types';

type ResourceKindFilter = 'all' | 'boards' | 'worksheets';

type BoardCatalogRow = BoardLibraryItem & { kind: 'board' };
type LibraryCatalogRow = BoardCatalogRow | WorksheetLibraryItem;

type LibrarySort = 'new' | 'top_rated' | 'most_rated' | 'title' | 'subject';

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'new', label: 'Neueste zuerst' },
  { value: 'top_rated', label: 'Beste Bewertung' },
  { value: 'most_rated', label: 'Meiste Bewertungen' },
  { value: 'title', label: 'Titel A–Z' },
  { value: 'subject', label: 'Nach Fach gruppiert' },
];

const SORT_VALUES = new Set<LibrarySort>(SORT_OPTIONS.map((o) => o.value));

function readSortFromParams(sp: URLSearchParams): LibrarySort {
  const v = sp.get('sort');
  if (v && SORT_VALUES.has(v as LibrarySort)) return v as LibrarySort;
  return 'new';
}

function readKindFromParams(sp: URLSearchParams): ResourceKindFilter {
  const k = sp.get('kind');
  if (k === 'all' || k === 'boards' || k === 'worksheets') return k;
  return 'all';
}

const MIN_RATING_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Jede Bewertung' },
  { value: '3', label: 'Ab Ø 3,0' },
  { value: '3.5', label: 'Ab Ø 3,5' },
  { value: '4', label: 'Ab Ø 4,0' },
  { value: '4.5', label: 'Ab Ø 4,5' },
];

function BoardLibraryCatalogCard({
  board,
  index,
  libraryScope,
}: {
  board: BoardLibraryItem;
  index: number;
  libraryScope: BoardLibraryScope;
}) {
  const com = board.comment_count ?? 0;
  const isViewerOwner = Boolean(board.viewer_is_owner);
  const ratingCompact = board.avg_rating != null ? board.avg_rating.toFixed(1) : null;
  const techPreview = (board.used_libraries ?? []).slice(0, 2);
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.24) }}
      className="min-w-0"
    >
      <Link
        to={board.id}
        aria-label={
          libraryScope === 'mine'
            ? `${board.title || 'Board'} — Vorschau öffnen`
            : `${board.title || 'Board'} — Community-Vorschau öffnen`
        }
        className={cn(
          'group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-[var(--color-bg-card)]',
          'shadow-sm outline-none ring-indigo-400/80 transition-[transform,box-shadow,border-color] duration-150',
          'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
          'focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-app)]',
        )}
      >
        <div className="relative shrink-0 overflow-hidden">
          {techPreview.length > 0 ? (
            <div className="pointer-events-none absolute left-2 top-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
              {techPreview.map((lib) => (
                <span
                  key={lib}
                  className="truncate rounded-lg bg-slate-950/55 px-2 py-0.5 text-[10px] font-semibold leading-tight text-white shadow-sm backdrop-blur-md"
                >
                  {LIBRARY_TECH_LABELS[lib] ?? lib}
                </span>
              ))}
            </div>
          ) : null}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-slate-950/35 to-transparent',
              'opacity-80 transition-opacity duration-200 group-hover:opacity-95',
            )}
          />
          <BoardLibraryThumbnail
            boardId={board.id}
            html={board.html}
            css={board.css}
            javascript={board.javascript}
            usedLibraries={board.used_libraries ?? []}
            usedDatasets={board.used_datasets}
            density="storefront"
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pb-2.5 pt-2.5 sm:gap-2 sm:px-3 sm:pb-3 sm:pt-3">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight text-slate-900 sm:text-base">
              <span className="line-clamp-2">{board.title || 'Ohne Titel'}</span>
            </h2>
            {isViewerOwner ? (
              <Badge tone="primary" className="shrink-0 !rounded-lg !px-2 !py-0.5 !text-[10px] font-semibold">
                Deins
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-slate-500">
            <span className="line-clamp-1 min-w-0">
              {[board.subject, board.grade].filter(Boolean).join(' · ') || 'Ohne Angabe zu Fach oder Klasse'}
            </span>
            <LibraryPlannedDuration minutes={board.planned_duration_minutes} />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
              <span className="inline-flex items-center gap-1 tabular-nums text-slate-700">
                <Star size={13} strokeWidth={2} className="shrink-0 text-amber-500" aria-hidden />
                <span className="font-medium">{ratingCompact ?? '—'}</span>
                <span className="font-normal text-slate-400">({board.rating_count})</span>
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <MessageCircle size={13} strokeWidth={2} className="shrink-0 text-indigo-500" aria-hidden />
                {com}
              </span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100/80 transition-[background-color,color] group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-500">
              Ansehen
              <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

function WorksheetLibraryCatalogCard({ ws, index }: { ws: WorksheetLibraryItem; index: number }) {
  const isViewerOwner = Boolean(ws.viewer_is_owner);
  const gradeLine = [ws.subject, ws.grade ? `Klasse ${ws.grade}` : ''].filter(Boolean).join(' · ');
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.24) }}
      className="min-w-0"
    >
      <Link
        to={`/app/worksheets/${ws.id}`}
        aria-label={`${ws.title || 'Arbeitsblatt'} — öffnen`}
        className={cn(
          'group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-[var(--color-bg-card)]',
          'shadow-sm outline-none ring-indigo-400/80 transition-[transform,box-shadow,border-color] duration-150',
          'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
          'focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-app)]',
        )}
      >
        <div className="relative flex aspect-[16/10] shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50">
          <FileText className="h-12 w-12 text-slate-300" strokeWidth={1.25} aria-hidden />
          <span className="pointer-events-none absolute left-2 top-2 rounded-lg bg-violet-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            Arbeitsblatt
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pb-2.5 pt-2.5 sm:gap-2 sm:px-3 sm:pb-3 sm:pt-3">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight text-slate-900 sm:text-base">
              <span className="line-clamp-2">{ws.title || 'Ohne Titel'}</span>
            </h2>
            {isViewerOwner ? (
              <Badge tone="primary" className="shrink-0 !rounded-lg !px-2 !py-0.5 !text-[10px] font-semibold">
                Deins
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-slate-500">
            <span className="line-clamp-1 min-w-0">{gradeLine || 'Ohne Angabe zu Fach oder Klasse'}</span>
            <LibraryPlannedDuration minutes={ws.planned_duration_minutes} />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <p className="text-[12px] text-slate-400">Druck & Vorschau im Editor</p>
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-800 ring-1 ring-violet-100/90 transition-[background-color,color] group-hover:bg-violet-600 group-hover:text-white group-hover:ring-violet-500">
              Öffnen
              <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

export function BoardLibraryListPage() {
  const location = useLocation();

  const [libraryScope, setLibraryScope] = useState<BoardLibraryScope>('all');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const [purposeFilter, setPurposeFilter] = useState<LibraryPurposeFilter>('');
  const [subjectFilter, setSubjectFilter] = useState(() => new URLSearchParams(location.search).get('subject') ?? '');
  const [gradeFilter, setGradeFilter] = useState('');
  const [techFilter, setTechFilter] = useState(() => new URLSearchParams(location.search).get('tech') ?? '');
  const [minRating, setMinRating] = useState('');
  const [sort, setSort] = useState<LibrarySort>(() => readSortFromParams(new URLSearchParams(location.search)));
  const [resourceKind, setResourceKind] = useState<ResourceKindFilter>(() =>
    readKindFromParams(new URLSearchParams(location.search)),
  );

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    setSort(readSortFromParams(sp));
    setSubjectFilter(sp.get('subject') ?? '');
    setTechFilter(sp.get('tech') ?? '');
    setResourceKind(readKindFromParams(sp));
    setQuery(sp.get('q') ?? '');
  }, [location.search]);

  const libraryKey = boardsLibraryQueryKey(libraryScope);
  const worksheetLibKey = worksheetsLibraryQueryKey(libraryScope);

  const loadBoards = resourceKind !== 'worksheets';
  const loadWorksheets = resourceKind !== 'boards';

  const {
    data: boardItems = [],
    isPending: boardsPending,
    isError: boardsError,
  } = useQuery({
    queryKey: libraryKey,
    queryFn: () => fetchBoardLibrary(libraryScope),
    enabled: loadBoards,
    staleTime: 30_000,
  });

  const {
    data: worksheetItems = [],
    isPending: worksheetsPending,
    isError: worksheetsError,
  } = useQuery({
    queryKey: worksheetLibKey,
    queryFn: () => fetchWorksheetLibrary(libraryScope),
    enabled: loadWorksheets,
    staleTime: 30_000,
  });

  const isPending = (loadBoards && boardsPending) || (loadWorksheets && worksheetsPending);
  const isError = Boolean(boardsError || worksheetsError);

  const catalogRows = useMemo((): LibraryCatalogRow[] => {
    const boards: BoardCatalogRow[] = loadBoards
      ? boardItems.map((b) => ({ ...b, kind: 'board' as const }))
      : [];
    const sheets = loadWorksheets ? worksheetItems : [];
    if (resourceKind === 'boards') return boards;
    if (resourceKind === 'worksheets') return sheets;
    return [...boards, ...sheets];
  }, [boardItems, worksheetItems, loadBoards, loadWorksheets, resourceKind]);

  const subjectFilterOptions = useMemo(
    () => uniqueCanonicalSubjectLabelsFromRows(catalogRows),
    [catalogRows],
  );

  useEffect(() => {
    if (isPending) return;
    if (!subjectFilter) return;
    if (subjectFilterOptions.includes(subjectFilter)) return;
    setSubjectFilter('');
  }, [isPending, subjectFilter, subjectFilterOptions]);

  const sourceCount = (loadBoards ? boardItems.length : 0) + (loadWorksheets ? worksheetItems.length : 0);

  const techOptions = useMemo(() => {
    const set = new Set<LibraryId>(BOARD_LIBRARY_TECH_FILTER_IDS);
    for (const b of boardItems) {
      for (const lib of b.used_libraries ?? []) set.add(lib);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  }, [boardItems]);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = minRating ? parseFloat(minRating) : null;

    let list = catalogRows.filter((row) => {
      if (row.kind === 'board') {
        const b = row;
        if (q) {
          const hay = `${b.title} ${b.subject} ${b.topic}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (purposeFilter && !matchesLibraryPurpose(b.board_type, purposeFilter)) return false;
        if (subjectFilter && !matchesLibrarySubjectFilter(b.subject, subjectFilter)) return false;
        if (gradeFilter && !matchesLibraryGradeFilter(b.grade, gradeFilter, b.grade_from, b.grade_to)) return false;
        if (techFilter && !(b.used_libraries ?? []).includes(techFilter as LibraryId)) return false;
        if (min != null && !Number.isNaN(min)) {
          if (b.avg_rating == null || b.avg_rating < min) return false;
        }
        return true;
      }
      const w = row;
      if (q) {
        const hay = `${w.title} ${w.subject} ${w.topic}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (purposeFilter) return false;
      if (subjectFilter && !matchesLibrarySubjectFilter(w.subject, subjectFilter)) return false;
      if (gradeFilter && !matchesLibraryGradeFilter(w.grade, gradeFilter)) return false;
      if (techFilter) return false;
      if (min != null && !Number.isNaN(min)) return false;
      return true;
    });

    const pub = (row: LibraryCatalogRow) =>
      row.library_published_at ? new Date(row.library_published_at).getTime() : 0;

    switch (sort) {
      case 'new':
        list.sort((a, b) => pub(b) - pub(a) || b.title.localeCompare(a.title, 'de'));
        break;
      case 'top_rated':
        list.sort((a, b) => {
          const av = a.kind === 'board' ? (a.avg_rating ?? -1) : -1;
          const bv = b.kind === 'board' ? (b.avg_rating ?? -1) : -1;
          if (bv !== av) return bv - av;
          return pub(b) - pub(a);
        });
        break;
      case 'most_rated':
        list.sort((a, b) => {
          const ac = a.kind === 'board' ? a.rating_count : 0;
          const bc = b.kind === 'board' ? b.rating_count : 0;
          if (bc !== ac) return bc - ac;
          return pub(b) - pub(a);
        });
        break;
      case 'title':
        list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
        break;
      case 'subject':
        list.sort((a, b) => {
          const sa = canonicalSubjectLabel(a.subject).localeCompare(canonicalSubjectLabel(b.subject), 'de');
          if (sa !== 0) return sa;
          return (a.title || '').localeCompare(b.title || '', 'de');
        });
        break;
      default:
        break;
    }

    return list;
  }, [catalogRows, query, purposeFilter, subjectFilter, gradeFilter, techFilter, minRating, sort]);

  const groupedBySubject = useMemo(() => {
    if (sort !== 'subject') return null;
    const map = new Map<string, LibraryCatalogRow[]>();
    for (const row of filteredSorted) {
      const k = canonicalSubjectLabel(row.subject);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'de'));
  }, [filteredSorted, sort]);

  const ownerCount = useMemo(() => {
    const labels = new Set<string>();
    for (const b of boardItems) labels.add(b.owner_label);
    for (const w of worksheetItems) labels.add(w.owner_label);
    return labels.size;
  }, [boardItems, worksheetItems]);

  const clearFilters = () => {
    setQuery('');
    setPurposeFilter('');
    setSubjectFilter('');
    setGradeFilter('');
    setTechFilter('');
    setMinRating('');
    setSort('new');
    setResourceKind('all');
  };

  const activeFilterCount =
    (resourceKind !== 'all' ? 1 : 0) +
    (purposeFilter ? 1 : 0) +
    (subjectFilter ? 1 : 0) +
    (gradeFilter ? 1 : 0) +
    (techFilter ? 1 : 0) +
    (minRating ? 1 : 0) +
    (sort !== 'new' ? 1 : 0);

  const emptyTitle =
    libraryScope === 'mine'
      ? sourceCount === 0
        ? 'Noch nichts veröffentlicht'
        : 'Keine Treffer'
      : sourceCount === 0
        ? 'Noch keine öffentlichen Inhalte'
        : 'Keine Treffer';

  const emptyDescription =
    libraryScope === 'mine'
      ? sourceCount === 0
        ? 'Wenn du ein Board oder Arbeitsblatt für die Bibliothek freigibst, erscheint es hier.'
        : 'Passe Suche oder Filter an oder setze sie zurück.'
      : sourceCount === 0
        ? 'Sobald Kolleg:innen Inhalte für die Bibliothek freigeben, erscheinen sie hier.'
        : 'Passe Suche oder Filter an oder setze sie zurück.';

  const catalogMetaLine = useMemo(() => {
    if (isPending) return '';
    const n = filteredSorted.length;
    const boardsN = filteredSorted.filter((r) => r.kind === 'board').length;
    const wsN = filteredSorted.filter((r) => r.kind === 'worksheet').length;
    const parts: string[] = [];
    if (boardsN > 0) parts.push(`${boardsN} ${boardsN === 1 ? 'Board' : 'Boards'}`);
    if (wsN > 0) parts.push(`${wsN} ${wsN === 1 ? 'Arbeitsblatt' : 'Arbeitsblätter'}`);
    const head = parts.length > 0 ? parts.join(' · ') : `${n} Einträge`;
    const tail = 'Antippen zum Öffnen';
    if (libraryScope === 'all' && sourceCount > 0) {
      return `${head} · ${ownerCount} Kolleg:innen · ${tail}`;
    }
    if (libraryScope === 'mine' && sourceCount > 0) {
      return `${head} · Deine Veröffentlichungen · ${tail}`;
    }
    return `${head} · ${tail}`;
  }, [isPending, filteredSorted, libraryScope, sourceCount, ownerCount]);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-[var(--color-bg-app)]">
      <div className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-[var(--color-bg-card)]">
        <div className="mx-auto max-w-[1600px] space-y-1.5 px-2 py-1.5 sm:px-3 sm:py-2">
          <p className="sr-only">
            Karten antippen öffnet die Community-Vorschau mit Live-Test, Bewerten, Kommentieren und Übernehmen in die
            eigene Sammlung.
          </p>

          <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between xl:gap-x-3 xl:gap-y-2">
            <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center xl:gap-x-2 xl:gap-y-2">
              <div className="shrink-0" role="group" aria-label="Bibliotheksbereich">
                <div className="flex h-9 w-full gap-px rounded-lg border border-slate-200 bg-slate-200 p-px sm:inline-flex sm:w-auto">
                  <button
                    type="button"
                    className={cn(
                      'flex flex-1 items-center justify-center rounded-[7px] bg-[var(--color-bg-card)] px-2 text-xs font-semibold transition sm:flex-none sm:rounded-none sm:px-3 sm:first:rounded-l-[7px]',
                      libraryScope === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'text-[var(--color-ink-600)] hover:bg-[var(--color-bg-muted)]',
                    )}
                    onClick={() => setLibraryScope('all')}
                  >
                    <span className="sm:hidden">Öffentlich</span>
                    <span className="hidden sm:inline">Alle öffentlichen</span>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex flex-1 items-center justify-center rounded-[7px] bg-[var(--color-bg-card)] px-2 text-xs font-semibold transition sm:flex-none sm:rounded-none sm:px-3 sm:last:rounded-r-[7px]',
                      libraryScope === 'mine'
                        ? 'bg-indigo-600 text-white'
                        : 'text-[var(--color-ink-600)] hover:bg-[var(--color-bg-muted)]',
                    )}
                    onClick={() => setLibraryScope('mine')}
                  >
                    <span className="sm:hidden">Meine</span>
                    <span className="hidden sm:inline">Meine Veröffentlichungen</span>
                  </button>
                </div>
              </div>

              <p className="sr-only">
                Filter nach Inhaltstyp (Boards oder Arbeitsblätter) und nach Board-Art (Aufgaben oder Präsentationen).
              </p>

              <div className="flex min-w-0 shrink-0 flex-col gap-1.5 border-t border-slate-100 pt-2 sm:flex-row sm:items-center sm:gap-2 sm:border-t-0 sm:pt-0 xl:border-l xl:border-slate-100 xl:pl-3">
                <span className="hidden shrink-0 text-[11px] font-medium text-slate-500 sm:inline">Typ</span>
                <div
                  className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-slate-100/90 p-0.5"
                  role="group"
                  aria-label="Nach Boards oder Arbeitsblättern filtern"
                >
                  {(
                    [
                      { v: 'all' as const, label: 'Alle' },
                      { v: 'boards' as const, label: 'Boards' },
                      { v: 'worksheets' as const, label: 'Arbeitsblätter' },
                    ] as const
                  ).map(({ v, label }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setResourceKind(v)}
                      className={cn(
                        'flex min-h-9 shrink-0 items-center justify-center rounded-md px-2.5 py-1 text-[11px] font-semibold transition sm:px-3 sm:text-xs',
                        resourceKind === v
                          ? 'bg-white text-indigo-900 shadow-sm ring-1 ring-slate-200/90'
                          : 'text-slate-600 hover:bg-white/70',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex min-w-0 shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                <span className="hidden shrink-0 text-[11px] font-medium text-slate-500 sm:inline">Art</span>
                <div
                  className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-slate-100/90 p-0.5"
                  role="presentation"
                >
                  {(
                    [
                      { v: '' as const, label: 'Alle' },
                      { v: 'tasks' as const, label: 'Aufgaben' },
                      { v: 'presentations' as const, label: 'Präsentationen' },
                    ] as const
                  ).map(({ v, label }) => (
                    <button
                      key={v || 'all'}
                      type="button"
                      onClick={() => setPurposeFilter(v)}
                      className={cn(
                        'flex min-h-9 shrink-0 items-center justify-center rounded-md px-2.5 py-1 text-[11px] font-semibold transition sm:px-3 sm:text-xs',
                        purposeFilter === v
                          ? 'bg-white text-indigo-900 shadow-sm ring-1 ring-slate-200/90'
                          : 'text-slate-600 hover:bg-white/70',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex min-h-9 min-w-0 shrink-0 items-center justify-end gap-1.5 max-xl:w-full">
              <SearchInput
                placeholder="Suchen …"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Bibliothek durchsuchen"
                containerClassName="min-w-0 w-full max-w-[min(100%,280px)] shrink-0 xl:max-w-[220px] 2xl:max-w-[260px]"
                iconSize={15}
                className="!h-9 !min-h-0 !py-0 !text-[13px] leading-none placeholder:text-slate-400"
              />
              <div className="relative shrink-0">
                <IconButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  id="library-filters-toggle"
                  aria-expanded={filtersExpanded}
                  aria-controls="library-advanced-filters"
                  aria-label={filtersExpanded ? 'Erweiterte Filter ausblenden' : 'Erweiterte Filter und Sortierung'}
                  title="Filter & Sortierung"
                  className={cn('!h-9 !w-9', filtersExpanded && 'border-indigo-300 bg-indigo-50')}
                  onClick={() => setFiltersExpanded((v) => !v)}
                >
                  <SlidersHorizontal size={17} aria-hidden />
                </IconButton>
                {activeFilterCount > 0 ? (
                  <span
                    className="pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white"
                    aria-hidden
                  >
                    {activeFilterCount > 9 ? '9+' : activeFilterCount}
                  </span>
                ) : null}
              </div>
              {activeFilterCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden !h-9 shrink-0 !px-2 !text-[12px] text-slate-600 sm:inline-flex"
                  onClick={clearFilters}
                >
                  Zurücksetzen
                </Button>
              ) : null}
            </div>
          </div>

          {!isPending && subjectFilterOptions.length > 0 ? (
            <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5">
              <p id="library-subject-chips-label" className="sr-only">
                Nach Fach filtern: Pfeiltasten links und rechts oder Tastatur nach Fokus auf die Leiste
                (Pfeil links/rechts, Pos1, Ende). Zum Schieben Maus oder Finger gedrückt halten und horizontal
                ziehen; auf Touch Geräten zusätzlich horizontal wischen.
              </p>
              <span className="hidden shrink-0 text-[11px] font-medium text-slate-500 sm:inline" aria-hidden>
                Fächer
              </span>
              <LibrarySubjectChipsScrollBar
                ariaLabelledBy="library-subject-chips-label"
                filterLabels={subjectFilterOptions}
                subjectFilter={subjectFilter}
                onSubjectFilterChange={setSubjectFilter}
              />
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {filtersExpanded && (
              <motion.div
                key="library-filters"
                id="library-advanced-filters"
                role="region"
                aria-labelledby="library-filters-toggle"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.33, 1, 0.68, 1] }}
                className="overflow-hidden border-t border-slate-100"
              >
                <div className="space-y-2 pt-2">
                  {activeFilterCount > 0 ? (
                    <div className="flex justify-end sm:hidden">
                      <Button type="button" variant="ghost" size="sm" className="!h-8 !text-[12px]" onClick={clearFilters}>
                        Alle zurücksetzen
                      </Button>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-5 xl:grid-cols-10">
                    <label className="min-w-0 xl:col-span-2">
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-500)]">
                        Fach
                      </span>
                      <select
                        className="select !h-9 w-full py-0 text-[13px] leading-snug sm:!h-8"
                        value={subjectFilter}
                        onChange={(e) => setSubjectFilter(e.target.value)}
                        aria-label="Nach Fach filtern"
                      >
                        <option value="">Alle Fächer</option>
                        {subjectFilterOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-0 xl:col-span-2">
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-500)]">
                        Klasse
                      </span>
                      <select
                        className="select !h-9 w-full py-0 text-[13px] leading-snug sm:!h-8"
                        value={gradeFilter}
                        onChange={(e) => setGradeFilter(e.target.value)}
                        aria-label="Nach Klasse filtern"
                      >
                        <option value="">Alle Klassenstufen</option>
                        {LIBRARY_GRADE_STEPS.map((g) => (
                          <option key={g} value={g}>
                            Klasse {g}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-0 xl:col-span-2">
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-500)]">
                        Technik
                      </span>
                      <select
                        className="select !h-9 w-full py-0 text-[13px] leading-snug sm:!h-8"
                        value={techFilter}
                        onChange={(e) => setTechFilter(e.target.value)}
                        aria-label="Nach Bibliothek filtern"
                      >
                        <option value="">Alle</option>
                        {techOptions.map((id) => (
                          <option key={id} value={id}>
                            {LIBRARY_TECH_LABELS[id] ?? id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-0 xl:col-span-2">
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-500)]">
                        Min. Ø
                      </span>
                      <select
                        className="select !h-9 w-full py-0 text-[13px] leading-snug sm:!h-8"
                        value={minRating}
                        onChange={(e) => setMinRating(e.target.value)}
                        aria-label="Nach Mindestbewertung filtern"
                      >
                        {MIN_RATING_OPTIONS.map((o) => (
                          <option key={o.value || 'all'} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-0 sm:col-span-2 xl:col-span-2">
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-500)]">
                        Sortierung
                      </span>
                      <select
                        className="select !h-9 w-full py-0 text-[13px] leading-snug sm:!h-8"
                        value={sort}
                        onChange={(e) => setSort(e.target.value as LibrarySort)}
                        aria-label="Sortierung der Liste"
                      >
                        {SORT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-[1600px] px-2 py-3 sm:px-3 sm:py-4 pb-12">
          {isError ? <Alert tone="error">Bibliothek konnte nicht geladen werden.</Alert> : null}

          {isPending ? (
            <p className="text-[var(--color-ink-500)]">Lade Katalog …</p>
          ) : filteredSorted.length === 0 ? (
            <EmptyState
              title={emptyTitle}
              description={emptyDescription}
              action={
                sourceCount > 0 ? (
                  <Button type="button" variant="secondary" onClick={clearFilters}>
                    Filter zurücksetzen
                  </Button>
                ) : undefined
              }
            />
          ) : groupedBySubject ? (
            <div className="space-y-8">
              {groupedBySubject.map(([sectionTitle, rows], si) => (
                <section key={sectionTitle} className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink-900)] sm:text-xl">
                        {sectionTitle}
                      </h3>
                      <p className="mt-0.5 text-[13px] text-[var(--color-ink-500)]">
                        {rows.length} {rows.length === 1 ? 'Eintrag' : 'Einträge'}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 md:gap-4">
                    {rows.map((row, i) =>
                      row.kind === 'board' ? (
                        <BoardLibraryCatalogCard
                          key={`board-${row.id}`}
                          board={row}
                          index={si * 30 + i}
                          libraryScope={libraryScope}
                        />
                      ) : (
                        <WorksheetLibraryCatalogCard
                          key={`ws-${row.id}`}
                          ws={row}
                          index={si * 30 + i}
                        />
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <>
              <header className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink-900)] sm:text-xl">
                    Katalog
                  </h2>
                  {catalogMetaLine ? (
                    <p className="mt-0.5 text-[13px] text-[var(--color-ink-500)]">{catalogMetaLine}</p>
                  ) : null}
                </div>
              </header>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 md:gap-4">
                {filteredSorted.map((row, i) =>
                  row.kind === 'board' ? (
                    <BoardLibraryCatalogCard
                      key={`board-${row.id}`}
                      board={row}
                      index={i}
                      libraryScope={libraryScope}
                    />
                  ) : (
                    <WorksheetLibraryCatalogCard key={`ws-${row.id}`} ws={row} index={i} />
                  ),
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

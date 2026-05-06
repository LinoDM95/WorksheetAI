import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, MessageCircle, SlidersHorizontal, Star } from 'lucide-react';
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
  type BoardLibraryScope,
} from '../../../lib/listQueries';
import { fetchBoardLibrary } from '../boardsApi';
import {
  BOARD_LIBRARY_TECH_FILTER_IDS,
  LIBRARY_TECH_LABELS,
} from '../lib/boardLibraryLabels';
import { BoardLibraryThumbnail } from '../components/library/BoardLibraryThumbnail';
import type { BoardLibraryItem, LibraryId } from '../types';

type LibrarySort = 'new' | 'top_rated' | 'most_rated' | 'title' | 'subject';

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'new', label: 'Neueste zuerst' },
  { value: 'top_rated', label: 'Beste Bewertung' },
  { value: 'most_rated', label: 'Meiste Bewertungen' },
  { value: 'title', label: 'Titel A–Z' },
  { value: 'subject', label: 'Nach Fach gruppiert' },
];

const MIN_RATING_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Jede Bewertung' },
  { value: '3', label: 'Ab Ø 3,0' },
  { value: '3.5', label: 'Ab Ø 3,5' },
  { value: '4', label: 'Ab Ø 4,0' },
  { value: '4.5', label: 'Ab Ø 4,5' },
];

export function BoardLibraryListPage() {
  const [libraryScope, setLibraryScope] = useState<BoardLibraryScope>('all');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [minRating, setMinRating] = useState('');
  const [sort, setSort] = useState<LibrarySort>('new');

  const libraryKey = boardsLibraryQueryKey(libraryScope);

  const { data: items = [], isPending, isError } = useQuery({
    queryKey: libraryKey,
    queryFn: () => fetchBoardLibrary(libraryScope),
    staleTime: 30_000,
  });

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of items) {
      const s = b.subject?.trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  }, [items]);

  const gradeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of items) {
      const g = b.grade?.trim();
      if (g) set.add(g);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  }, [items]);

  const techOptions = useMemo(() => {
    const set = new Set<LibraryId>(BOARD_LIBRARY_TECH_FILTER_IDS);
    for (const b of items) {
      for (const lib of b.used_libraries ?? []) set.add(lib);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  }, [items]);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = minRating ? parseFloat(minRating) : null;

    let list = items.filter((b) => {
      if (q) {
        const hay = `${b.title} ${b.subject} ${b.topic} ${b.owner_label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (subjectFilter && b.subject !== subjectFilter) return false;
      if (gradeFilter && b.grade !== gradeFilter) return false;
      if (techFilter && !(b.used_libraries ?? []).includes(techFilter as LibraryId)) return false;
      if (min != null && !Number.isNaN(min)) {
        if (b.avg_rating == null || b.avg_rating < min) return false;
      }
      return true;
    });

    const pub = (b: BoardLibraryItem) =>
      b.library_published_at ? new Date(b.library_published_at).getTime() : 0;

    switch (sort) {
      case 'new':
        list.sort((a, b) => pub(b) - pub(a) || b.title.localeCompare(a.title, 'de'));
        break;
      case 'top_rated':
        list.sort((a, b) => {
          const av = a.avg_rating ?? -1;
          const bv = b.avg_rating ?? -1;
          if (bv !== av) return bv - av;
          return pub(b) - pub(a);
        });
        break;
      case 'most_rated':
        list.sort((a, b) => {
          if (b.rating_count !== a.rating_count) return b.rating_count - a.rating_count;
          return pub(b) - pub(a);
        });
        break;
      case 'title':
        list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
        break;
      case 'subject':
        list.sort((a, b) => {
          const sa = (a.subject || '\uffff').localeCompare(b.subject || '\uffff', 'de');
          if (sa !== 0) return sa;
          return (a.title || '').localeCompare(b.title || '', 'de');
        });
        break;
      default:
        break;
    }

    return list;
  }, [items, query, subjectFilter, gradeFilter, techFilter, minRating, sort]);

  const groupedBySubject = useMemo(() => {
    if (sort !== 'subject') return null;
    const map = new Map<string, BoardLibraryItem[]>();
    for (const b of filteredSorted) {
      const k = b.subject?.trim() || 'Ohne Fach';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(b);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'de'));
  }, [filteredSorted, sort]);

  const ownerCount = useMemo(() => new Set(items.map((b) => b.owner_label)).size, [items]);

  const subjectQuickChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of items) {
      const s = b.subject?.trim();
      if (!s) continue;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
      .map(([s]) => s)
      .slice(0, 14);
  }, [items]);

  const clearFilters = () => {
    setQuery('');
    setSubjectFilter('');
    setGradeFilter('');
    setTechFilter('');
    setMinRating('');
    setSort('new');
  };

  const activeFilterCount =
    (subjectFilter ? 1 : 0) +
    (gradeFilter ? 1 : 0) +
    (techFilter ? 1 : 0) +
    (minRating ? 1 : 0) +
    (sort !== 'new' ? 1 : 0);

  const cc = (b: BoardLibraryItem) => b.comment_count ?? 0;
  const vo = (b: BoardLibraryItem) => Boolean(b.viewer_is_owner);

  const renderCompactCard = (b: BoardLibraryItem, index: number) => {
    const com = cc(b);
    const ratingCompact = b.avg_rating != null ? b.avg_rating.toFixed(1) : null;
    const techPreview = (b.used_libraries ?? []).slice(0, 2);
    return (
      <motion.article
        key={b.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.24) }}
        className="min-w-0"
      >
        <Link
          to={b.id}
          aria-label={
            libraryScope === 'mine'
              ? `${b.title || 'Board'} — Vorschau und Präsentation`
              : `${b.title || 'Board'} — Community-Vorschau öffnen`
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
              boardId={b.id}
              html={b.html}
              css={b.css}
              javascript={b.javascript}
              usedLibraries={b.used_libraries ?? []}
              usedDatasets={b.used_datasets}
              density="storefront"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pb-2.5 pt-2.5 sm:gap-2 sm:px-3 sm:pb-3 sm:pt-3">
            <div className="flex items-start gap-2">
              <h2 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight text-slate-900 sm:text-base">
                <span className="line-clamp-2">{b.title || 'Ohne Titel'}</span>
              </h2>
              {vo(b) ? (
                <Badge tone="primary" className="shrink-0 !rounded-lg !px-2 !py-0.5 !text-[10px] font-semibold">
                  Deins
                </Badge>
              ) : null}
            </div>
            <p className="line-clamp-1 text-[13px] text-slate-500">
              {[b.subject, b.grade].filter(Boolean).join(' · ') || 'Ohne Angabe zu Fach oder Klasse'}
            </p>
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
                <span className="inline-flex items-center gap-1 tabular-nums text-slate-700">
                  <Star size={13} strokeWidth={2} className="shrink-0 text-amber-500" aria-hidden />
                  <span className="font-medium">{ratingCompact ?? '—'}</span>
                  <span className="font-normal text-slate-400">
                    ({b.rating_count})
                  </span>
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
  };

  const emptyTitle =
    libraryScope === 'mine'
      ? items.length === 0
        ? 'Noch nichts veröffentlicht'
        : 'Keine Treffer'
      : items.length === 0
        ? 'Noch keine öffentlichen Boards'
        : 'Keine Treffer';

  const emptyDescription =
    libraryScope === 'mine'
      ? items.length === 0
        ? 'Wenn du ein Board in der Bearbeitung für die Bibliothek freigibst, erscheint es hier — inklusive anonymen Kommentaren und Bewertungen.'
        : 'Passe Suche oder Filter an oder setze sie zurück.'
      : items.length === 0
        ? 'Sobald Kolleg:innen ein Board für die Bibliothek freigeben, erscheint es hier.'
        : 'Passe Suche oder Filter an oder setze sie zurück.';

  const catalogMetaLine = useMemo(() => {
    if (isPending) return '';
    const n = filteredSorted.length;
    const noun = n === 1 ? 'Board' : 'Boards';
    const tail = 'Antippen für Vorschau';
    if (libraryScope === 'all' && items.length > 0) {
      return `${n} ${noun} · ${ownerCount} Kolleg:innen · ${tail}`;
    }
    if (libraryScope === 'mine' && items.length > 0) {
      return `${n} ${noun} · Deine Veröffentlichungen · ${tail}`;
    }
    return `${n} ${noun} · ${tail}`;
  }, [isPending, filteredSorted.length, libraryScope, items.length, ownerCount]);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-[var(--color-bg-app)]">
      <div className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-[var(--color-bg-card)]">
        <div className="mx-auto max-w-[1600px] space-y-1.5 px-2 py-1.5 sm:px-3 sm:py-2">
          <p className="sr-only">
            Karten antippen öffnet die Community-Vorschau mit Live-Test, Bewerten, Kommentieren und Übernehmen in die
            eigene Sammlung.
          </p>

          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
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

            <div className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5">
              <SearchInput
                placeholder="Suchen …"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Bibliothek durchsuchen"
                containerClassName="min-w-0 flex-1 sm:max-w-xl lg:max-w-2xl"
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

          {!isPending && subjectQuickChips.length > 0 ? (
            <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5">
              <p id="library-subject-chips-label" className="sr-only">
                Nach Fach filtern — horizontale Schnellwahl
              </p>
              <span className="hidden shrink-0 text-[11px] font-medium text-slate-500 sm:inline" aria-hidden>
                Fächer
              </span>
              <div
                role="group"
                aria-labelledby="library-subject-chips-label"
                className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-px [scrollbar-width:none] sm:gap-1.5 [&::-webkit-scrollbar]:hidden"
              >
                <button
                  type="button"
                  onClick={() => setSubjectFilter('')}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                    !subjectFilter
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200/80',
                  )}
                >
                  Alle
                </button>
                {subjectQuickChips.map((subj) => (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => setSubjectFilter(subjectFilter === subj ? '' : subj)}
                    className={cn(
                      'max-w-[11rem] shrink-0 truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                      subjectFilter === subj
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200/80',
                    )}
                    title={subj}
                  >
                    {subj}
                  </button>
                ))}
              </div>
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
                        {subjectOptions.map((s) => (
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
                        <option value="">Alle</option>
                        {gradeOptions.map((g) => (
                          <option key={g} value={g}>
                            {g}
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
                items.length > 0 ? (
                  <Button type="button" variant="secondary" onClick={clearFilters}>
                    Filter zurücksetzen
                  </Button>
                ) : undefined
              }
            />
          ) : groupedBySubject ? (
            <div className="space-y-8">
              {groupedBySubject.map(([sectionTitle, boards], si) => (
                <section key={sectionTitle} className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink-900)] sm:text-xl">
                        {sectionTitle}
                      </h3>
                      <p className="mt-0.5 text-[13px] text-[var(--color-ink-500)]">
                        {boards.length} Board{boards.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 md:gap-4">
                    {boards.map((b, i) => renderCompactCard(b, si * 30 + i))}
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
                {filteredSorted.map((b, i) => renderCompactCard(b, i))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

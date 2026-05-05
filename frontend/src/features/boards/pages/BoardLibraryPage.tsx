import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowDownAZ, Flame, LayoutGrid, Library, Sparkles, Star, TrendingUp } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
} from '../../../components/ui';
import { BOARDS_LIBRARY_QUERY_KEY, BOARDS_LIST_QUERY_KEY } from '../../../lib/listQueries';
import { adoptBoardFromLibrary, fetchBoardLibrary, rateBoardInLibrary } from '../boardsApi';
import { addPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';
import type { BoardLibraryItem, LibraryId } from '../types';

type LibrarySort = 'new' | 'top_rated' | 'most_rated' | 'title' | 'subject';

const TECH_LABELS: Record<LibraryId, string> = {
  d3: 'D3',
  roughjs: 'Rough.js',
  chartjs: 'Chart.js',
  leaflet: 'Karte',
  turf: 'Turf',
  topojson: 'TopoJSON',
};

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

function AverageStars({ value }: { value: number | null | undefined }) {
  const v = value == null ? 0 : Math.min(5, Math.max(0, value));
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={
        value != null ? `Durchschnittsbewertung ${value.toFixed(1)} von 5 Sternen` : 'Noch keine Bewertungen'
      }
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.min(1, Math.max(0, v - (i - 1)));
        return (
          <span key={i} className="relative block h-[1.125rem] w-[1.125rem] shrink-0">
            <Star
              size={18}
              strokeWidth={1.35}
              className="absolute left-0 top-0 text-[var(--color-ink-200)] fill-[var(--color-ink-50)]"
              aria-hidden
            />
            <span
              className="absolute left-0 top-0 h-full overflow-hidden"
              style={{ width: `${fill * 100}%` }}
            >
              <Star
                size={18}
                strokeWidth={1.35}
                className="text-amber-500 fill-amber-400"
                aria-hidden
              />
            </span>
          </span>
        );
      })}
    </div>
  );
}

function YourRatingStars({
  value,
  disabled,
  onPick,
}: {
  value: number | null | undefined;
  disabled: boolean;
  onPick: (stars: number) => void;
}) {
  const active = value ?? 0;
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Deine Bewertung abgeben">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          aria-label={`${s} Sterne vergeben`}
          aria-pressed={active === s}
          className="rounded p-0.5 text-amber-500 transition hover:scale-110 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40"
          disabled={disabled}
          onClick={() => onPick(s)}
        >
          <Star
            size={20}
            strokeWidth={1.35}
            className={s <= active ? 'fill-amber-400 text-amber-500' : 'fill-transparent text-[var(--color-ink-300)]'}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

export function BoardLibraryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [minRating, setMinRating] = useState('');
  const [sort, setSort] = useState<LibrarySort>('new');

  const { data: items = [], isPending, isError } = useQuery({
    queryKey: BOARDS_LIBRARY_QUERY_KEY,
    queryFn: fetchBoardLibrary,
    staleTime: 30_000,
  });

  const adoptMutation = useMutation({
    mutationFn: (id: string) => adoptBoardFromLibrary(id),
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      addPendingFirstOpenBoard(board.id);
      navigate('/app/boards');
    },
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, stars }: { id: string; stars: number }) => rateBoardInLibrary(id, stars),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<BoardLibraryItem[]>(BOARDS_LIBRARY_QUERY_KEY, (old) =>
        (old ?? []).map((b) =>
          b.id === variables.id
            ? {
                ...b,
                my_stars: data.stars,
                avg_rating: data.avg_rating,
                rating_count: data.rating_count,
              }
            : b,
        ),
      );
    },
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
    const set = new Set<LibraryId>();
    for (const b of items) {
      for (const lib of b.used_libraries ?? []) set.add(lib);
    }
    return [...set].sort();
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

  const handleRate = (item: BoardLibraryItem, stars: number) => {
    rateMutation.mutate({ id: item.id, stars });
  };

  const renderCard = (b: BoardLibraryItem, index: number) => (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.25) }}
      key={b.id}
      className="group relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-sm)] transition-[box-shadow,transform] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-amber-400 opacity-80" />
      <div className="p-4 pt-5 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start gap-2 gap-y-1">
              <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug text-[var(--color-ink-900)] group-hover:text-indigo-800">
                {b.title || 'Ohne Titel'}
              </h2>
              {b.avg_rating != null && b.avg_rating >= 4 && (
                <Badge tone="accent" className="shrink-0 !text-[10px]">
                  Top
                </Badge>
              )}
            </div>
            <p className="text-sm text-[var(--color-ink-600)]">
              {[b.subject, b.grade, b.topic].filter(Boolean).join(' · ') || 'Keine Angaben zu Fach oder Thema'}
            </p>
            <p className="text-xs text-[var(--color-ink-500)]">
              Von <span className="font-medium text-[var(--color-ink-700)]">{b.owner_label}</span>
              {b.library_published_at ? (
                <>
                  {' '}
                  ·{' '}
                  {new Date(b.library_published_at).toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(b.used_libraries ?? []).length === 0 ? (
                <span className="text-[11px] text-[var(--color-ink-400)]">Ohne Zusatz-Bibliotheken</span>
              ) : (
                (b.used_libraries ?? []).map((lib) => (
                  <span
                    key={lib}
                    className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-800 ring-1 ring-indigo-100/80"
                  >
                    {TECH_LABELS[lib] ?? lib}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="shrink-0 space-y-3 rounded-[var(--radius-lg)] bg-[var(--color-bg-muted)]/80 p-3 sm:min-w-[240px]">
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-500)]">
                Community
              </p>
              <AverageStars value={b.avg_rating} />
              <p className="mt-1 text-xs text-[var(--color-ink-600)]">
                {b.avg_rating != null ? (
                  <>
                    <span className="font-semibold text-[var(--color-ink-800)]">{b.avg_rating.toFixed(1)}</span> von
                    5
                    {b.rating_count ? (
                      <span className="text-[var(--color-ink-500)]">
                        {' '}
                        · {b.rating_count} Bewertung{b.rating_count === 1 ? '' : 'en'}
                      </span>
                    ) : null}
                  </>
                ) : (
                  'Noch keine Bewertungen — lege los!'
                )}
              </p>
            </div>
            <div className="border-t border-[var(--color-border)] pt-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-500)]">
                Deine Bewertung
              </p>
              <YourRatingStars
                value={b.my_stars}
                disabled={rateMutation.isPending}
                onPick={(s) => handleRate(b, s)}
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              loading={adoptMutation.isPending && adoptMutation.variables === b.id}
              disabled={adoptMutation.isPending}
              onClick={() => adoptMutation.mutate(b.id)}
            >
              In meine Sammlung übernehmen
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-8 pb-10">
      <section className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-indigo-200/60 bg-gradient-to-br from-indigo-600 via-violet-600 to-slate-900 px-6 py-8 text-white shadow-[var(--shadow-lg)] sm:px-10 sm:py-10">
        <div
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <Sparkles size={14} className="text-amber-200" aria-hidden />
              Gemeinsame Tafelbilder
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Öffentliche Tafelbibliothek
            </h1>
            <p className="text-sm leading-relaxed text-indigo-100 sm:text-[15px]">
              Von Kolleg:innen freigegebene Smartboard-Inhalte entdecken, mit Sternen würdigen und mit einem Klick in die
              eigene Sammlung übernehmen — dort per KI und Editor weiterentwickeln.
            </p>
          </div>
          {!isPending && items.length > 0 ? (
            <div className="flex flex-shrink-0 flex-wrap gap-3 lg:justify-end">
              <div className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-white/15 px-4 py-3 backdrop-blur-md">
                <Library className="text-amber-200" size={22} aria-hidden />
                <div>
                  <p className="text-2xl font-bold tabular-nums">{items.length}</p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-100">Tafelbilder</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-white/15 px-4 py-3 backdrop-blur-md">
                <TrendingUp className="text-emerald-200" size={22} aria-hidden />
                <div>
                  <p className="text-2xl font-bold tabular-nums">{ownerCount}</p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-100">Kolleg:innen</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <Card flush className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-800)]">
            <LayoutGrid size={18} className="text-indigo-600" aria-hidden />
            Filtern & sortieren
            {activeFilterCount > 0 ? (
              <Badge tone="primary" className="!px-2 !py-0 !text-[10px]">
                {activeFilterCount} aktiv
              </Badge>
            ) : null}
          </div>
          {activeFilterCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="self-start sm:self-auto" onClick={clearFilters}>
              Alle Filter zurücksetzen
            </Button>
          ) : null}
        </div>

        <SearchInput
          placeholder="Titel, Fach, Thema oder Name durchsuchen …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Bibliothek durchsuchen"
          containerClassName="w-full"
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="field-label">Fach</span>
            <select
              className="select w-full"
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
          <label className="flex flex-col gap-1">
            <span className="field-label">Klasse / Stufe</span>
            <select
              className="select w-full"
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
          <label className="flex flex-col gap-1">
            <span className="field-label">Technik</span>
            <select
              className="select w-full"
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              aria-label="Nach Bibliothek filtern"
            >
              <option value="">Alle</option>
              {techOptions.map((id) => (
                <option key={id} value={id}>
                  {TECH_LABELS[id] ?? id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="field-label">Mindest-Ø</span>
            <select
              className="select w-full"
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
        </div>

        <label className="flex max-w-md flex-col gap-1">
          <span className="field-label">Sortierung</span>
          <select
            className="select w-full"
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

        <div className="flex flex-wrap gap-3 border-t border-[var(--color-border)] pt-3 text-[12px] text-[var(--color-ink-500)]">
          <span className="flex items-center gap-1">
            <Flame size={14} className="text-amber-500" aria-hidden />
            Sterne unter „Community“ zeigen den <strong className="font-semibold text-[var(--color-ink-700)]">Durchschnitt</strong> aller
            Bewertungen (auch halbe Sterne).
          </span>
          <span className="flex items-center gap-1">
            <ArrowDownAZ size={14} className="text-indigo-500" aria-hidden />
            Unter „Deine Bewertung“ trägst du deine eigene Note ein — der Durchschnitt aktualisiert sich sofort.
          </span>
        </div>
      </Card>

      {isError && <Alert tone="error">Bibliothek konnte nicht geladen werden.</Alert>}
      {adoptMutation.isError && <Alert tone="error">Übernehmen fehlgeschlagen. Erneut versuchen.</Alert>}
      {rateMutation.isError && <Alert tone="error">Bewertung konnte nicht gespeichert werden.</Alert>}

      {isPending ? (
        <p className="text-[var(--color-ink-500)]">Lade Einträge …</p>
      ) : filteredSorted.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? 'Noch keine öffentlichen Tafelbilder' : 'Keine Treffer'}
          description={
            items.length === 0
              ? 'Sobald Kolleg:innen ein Tafelbild für die Bibliothek freigeben, erscheint es hier.'
              : 'Passe Suche oder Filter an oder setze sie zurück.'
          }
          action={
            items.length > 0 ? (
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Filter zurücksetzen
              </Button>
            ) : undefined
          }
        />
      ) : groupedBySubject ? (
        <div className="space-y-10">
          {groupedBySubject.map(([sectionTitle, boards], si) => (
            <section key={sectionTitle} className="space-y-4">
              <div className="flex items-baseline gap-3 border-b border-[var(--color-border)] pb-2">
                <h2 className="font-display text-xl font-semibold text-[var(--color-ink-900)]">{sectionTitle}</h2>
                <span className="text-sm text-[var(--color-ink-500)]">
                  {boards.length} Tafelbild{boards.length === 1 ? '' : 'er'}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">{boards.map((b, i) => renderCard(b, si * 10 + i))}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{filteredSorted.map((b, i) => renderCard(b, i))}</div>
      )}
    </div>
  );
}

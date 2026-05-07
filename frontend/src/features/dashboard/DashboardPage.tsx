import { useMemo, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageCircle,
  Plus,
  Presentation,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import type { Worksheet } from '../../types';
import {
  BOARDS_LIST_QUERY_KEY,
  WORKSHEET_LIST_QUERY_KEY,
  WORKSHEET_LIST_STALE_MS,
  boardsLibraryQueryKey,
  fetchWorksheetList,
} from '../../lib/listQueries';
import { fetchBoardLibrary, fetchBoards } from '../../features/boards/boardsApi';
import type { BoardLibraryItem, LibraryId } from '../../features/boards/types';
import { formatRelative } from '../../lib/formatDate';
import { useAuth } from '../../lib/authContext';
import { Button, IconButton } from '../../components/ui';
import { cn } from '../../lib/cn';
import { BoardLibraryThumbnail } from '../boards/components/library/BoardLibraryThumbnail';
import { LibraryPlannedDuration } from '../boards/components/library/LibraryPlannedDuration';
import { LIBRARY_TECH_LABELS } from '../boards/lib/boardLibraryLabels';
import { canonicalSubjectLabel } from '../boards/lib/libraryCatalogFilters';

type RecentWorksheet = Pick<Worksheet, 'id' | 'title' | 'subject' | 'grade' | 'status' | 'updated_at'>;

type ContinueItem =
  | {
      kind: 'board';
      id: string;
      title: string;
      subject?: string;
      grade?: string;
      topic?: string;
      updated_at?: string;
      libraries?: LibraryId[];
    }
  | {
      kind: 'worksheet';
      id: string;
      title: string;
      subject?: string;
      grade?: number | null;
      status?: string;
      updated_at?: string;
    };

const greetingByHour = (h: number): string => {
  if (h < 5) return 'Schöne Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 14) return 'Hallo';
  if (h < 18) return 'Schönen Nachmittag';
  return 'Guten Abend';
};

/** Saisonale Schlagwörter für den jeweiligen Monat. Greift in der öffentlichen Bibliothek. */
const SEASONAL_KEYWORDS_BY_MONTH: Record<number, { label: string; keywords: string[] }> = {
  1: { label: 'Winter & Neujahr', keywords: ['winter', 'schnee', 'neujahr', 'januar', 'eis'] },
  2: { label: 'Karneval & Winter', keywords: ['karneval', 'fasching', 'fasnacht', 'winter', 'eis', 'februar'] },
  3: { label: 'Frühling beginnt', keywords: ['frühling', 'frühjahr', 'ostern', 'märz', 'küken', 'frühblüher'] },
  4: { label: 'Frühling & Ostern', keywords: ['frühling', 'ostern', 'aprilwetter', 'tier', 'küken', 'wiese'] },
  5: { label: 'Mai, Frühling & Pfingsten', keywords: ['frühling', 'mai', 'pfingsten', 'biene', 'blume', 'wiese', 'wetter'] },
  6: { label: 'Sommer beginnt', keywords: ['sommer', 'juni', 'sonne', 'wiese', 'wasser', 'em', 'wm', 'fußball'] },
  7: { label: 'Sommer & Ferien', keywords: ['sommer', 'ferien', 'juli', 'urlaub', 'meer', 'reise', 'lesen'] },
  8: { label: 'Spätsommer', keywords: ['sommer', 'august', 'urlaub', 'wasser', 'meer'] },
  9: { label: 'Schulanfang & Herbst', keywords: ['schulanfang', 'einschulung', 'herbst', 'september', 'apfel', 'erntedank'] },
  10: { label: 'Herbst & Halloween', keywords: ['herbst', 'halloween', 'oktober', 'kürbis', 'kastanie', 'blatt', 'wetter'] },
  11: { label: 'Herbst & St. Martin', keywords: ['herbst', 'sankt martin', 'st. martin', 'november', 'laterne', 'nebel'] },
  12: { label: 'Weihnachten & Winter', keywords: ['weihnachten', 'advent', 'nikolaus', 'winter', 'dezember', 'schnee'] },
};

/**
 * Beliebtheits-Score: Bewertung gewichtet mit log(1+Anzahl).
 * So gewinnen Boards mit echtem Konsens — nicht „1× 5,0“.
 */
const popularityScore = (b: BoardLibraryItem): number => {
  const r = b.avg_rating ?? 0;
  const c = b.rating_count ?? 0;
  return r * Math.log(1 + c);
};

const matchesAnyKeyword = (b: BoardLibraryItem, keys: string[]): boolean => {
  const hay = `${b.title} ${b.subject} ${b.grade} ${b.topic} ${b.description ?? ''}`.toLowerCase();
  return keys.some((k) => hay.includes(k.toLowerCase()));
};

/** Default-Schlagwortteppich, falls die Bibliothek noch leer ist. */
const FALLBACK_SUBJECT_CHIPS = [
  'Mathematik',
  'Deutsch',
  'Englisch',
  'Sachunterricht',
  'Biologie',
  'Geschichte',
  'Erdkunde',
  'Physik',
  'Chemie',
  'Musik',
  'Kunst',
  'Sport',
];

export function DashboardPage() {
  const { user } = useAuth();
  const greeting = useMemo(() => greetingByHour(new Date().getHours()), []);
  const seasonal = useMemo(() => SEASONAL_KEYWORDS_BY_MONTH[new Date().getMonth() + 1], []);

  const { data: wsData, isPending: worksheetsPending } = useQuery({
    queryKey: WORKSHEET_LIST_QUERY_KEY,
    queryFn: () => fetchWorksheetList<RecentWorksheet>(),
    staleTime: WORKSHEET_LIST_STALE_MS,
  });
  const { data: boardsData, isPending: boardsPending } = useQuery({
    queryKey: BOARDS_LIST_QUERY_KEY,
    queryFn: fetchBoards,
    staleTime: WORKSHEET_LIST_STALE_MS,
  });
  const { data: libraryData = [], isPending: libraryPending, isError: libraryError } = useQuery({
    queryKey: boardsLibraryQueryKey('all'),
    queryFn: () => fetchBoardLibrary('all'),
    staleTime: 60_000,
  });

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

  const greetingName = user?.first_name?.trim();
  const continueLoading = worksheetsPending && boardsPending;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-7 px-3 pb-12 pt-4 sm:px-4 sm:pt-5 lg:px-6">
      <HeroHeader greeting={greeting} greetingName={greetingName} />

      <ContinueSection items={continueItems} loading={continueLoading} />

      <LibraryRow
        title="Neu in der Bibliothek"
        description="Frische Smartboards aus dem Netzwerk — direkt aus der Community."
        items={newestLibrary}
        loading={libraryPending}
        error={libraryError}
        seeAllHref="/app/boards/library?sort=new&kind=boards"
      />

      {seasonal && seasonalLibrary.length > 0 ? (
        <LibraryRow
          title={`Passend zur Jahreszeit · ${seasonal.label}`}
          description="Boards, die thematisch in den Mai passen — sofort einsetzbar im Unterricht."
          items={seasonalLibrary}
          loading={false}
          seeAllHref="/app/boards/library?sort=new&kind=boards"
        />
      ) : null}

      {popularLibrary.length > 0 ? (
        <LibraryRow
          title="Beliebt bei Kolleg:innen"
          description="Hoch bewertete Boards mit echten Stimmen aus der Lehrerschaft."
          items={popularLibrary}
          loading={libraryPending}
          seeAllHref="/app/boards/library?sort=most_rated&kind=boards"
        />
      ) : null}

      {userTopSubject && userSubjectLibrary.length > 0 ? (
        <LibraryRow
          title={`Mehr aus deinem Fach · ${userTopSubject}`}
          description={`Wir sehen viel ${userTopSubject} bei dir — hier sind passende Boards aus der Community.`}
          items={userSubjectLibrary}
          loading={false}
          seeAllHref={`/app/boards/library?sort=new&kind=boards&subject=${encodeURIComponent(userTopSubject)}`}
        />
      ) : null}

      <ThemeChipsSection chips={subjectChips} />
    </div>
  );
}

const HeroHeader = ({ greeting, greetingName }: { greeting: string; greetingName?: string }) => (
  <header className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-indigo-50/60 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
    <div className="min-w-0">
      <h1 className="text-[22px] font-bold tracking-tight text-slate-900 sm:text-[26px]">
        {greeting}
        {greetingName ? `, ${greetingName}` : ''}.
      </h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-slate-500 sm:text-[14px]">
        Tippe ein Board an und starte direkt — oder lass dich unten von der Community inspirieren.
        Null Vorbereitungsaufwand.
      </p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button as="link" to="/app/boards" leftIcon={<Presentation size={16} aria-hidden />}>
        Neues Smartboard
      </Button>
      <Button as="link" to="/app/create" variant="secondary" leftIcon={<FileText size={16} aria-hidden />}>
        Neues Arbeitsblatt
      </Button>
    </div>
  </header>
);

const ContinueSection = ({ items, loading }: { items: ContinueItem[]; loading: boolean }) => {
  if (loading) {
    return (
      <SectionRow title="Weiter bearbeiten" description="Letzte Smartboards und Arbeitsblätter — antippen und sofort starten.">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonContinueCard key={i} />
        ))}
      </SectionRow>
    );
  }
  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
        <Sparkles size={20} className="mx-auto mb-2 text-indigo-500" aria-hidden />
        <h2 className="text-[16px] font-bold tracking-tight text-slate-900">Bereit für die erste Stunde?</h2>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">
          Dein Arbeitsbereich ist noch leer. Stöbere unten in der Bibliothek oder erstelle in zwei Minuten dein erstes Smartboard.
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button as="link" to="/app/boards" leftIcon={<Plus size={16} aria-hidden />}>
            Smartboard erstellen
          </Button>
        </div>
      </section>
    );
  }
  return (
    <SectionRow
      title="Weiter bearbeiten"
      description="Letzte Smartboards und Arbeitsblätter — antippen und sofort starten."
      seeAllHref={undefined}
    >
      {items.map((it) => (
        <ContinueCard key={`${it.kind}-${it.id}`} item={it} />
      ))}
    </SectionRow>
  );
};

const SectionRow = ({
  title,
  description,
  seeAllHref,
  children,
}: {
  title: string;
  description?: string;
  seeAllHref?: string;
  children: ReactNode;
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(320, Math.round(el.clientWidth * 0.85)), behavior: 'smooth' });
  };

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight text-slate-900 sm:text-[17px]">{title}</h2>
          {description ? (
            <p className="mt-0.5 line-clamp-1 text-[12.5px] text-slate-500 sm:text-[13px]">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="hidden sm:flex">
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Zurück blättern"
              className="!h-8 !w-8"
              onClick={() => scrollBy(-1)}
            >
              <ChevronLeft size={16} aria-hidden />
            </IconButton>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Weiter blättern"
              className="!h-8 !w-8"
              onClick={() => scrollBy(1)}
            >
              <ChevronRight size={16} aria-hidden />
            </IconButton>
          </div>
          {seeAllHref ? (
            <Link
              to={seeAllHref}
              className="inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-indigo-700 hover:underline"
            >
              Alle ansehen
              <ChevronRight size={14} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="-mx-1 overflow-x-auto pb-1.5 [scrollbar-color:rgb(203_213_225)_transparent] [scrollbar-width:thin]"
      >
        <div className="flex snap-x gap-3 px-1 pb-1">{children}</div>
      </div>
    </section>
  );
};

const LibraryRow = ({
  title,
  description,
  items,
  loading,
  error,
  seeAllHref,
}: {
  title: string;
  description?: string;
  items: BoardLibraryItem[];
  loading: boolean;
  error?: boolean;
  seeAllHref?: string;
}) => {
  if (loading) {
    return (
      <SectionRow title={title} description={description} seeAllHref={seeAllHref}>
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonLibraryCard key={i} />
        ))}
      </SectionRow>
    );
  }
  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800">
        Bibliothek konnte nicht geladen werden.
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <SectionRow title={title} description={description} seeAllHref={seeAllHref}>
      {items.map((b) => (
        <LibraryPosterCard key={b.id} board={b} />
      ))}
    </SectionRow>
  );
};

const LibraryPosterCard = ({ board }: { board: BoardLibraryItem }) => {
  const ratingCompact = board.avg_rating != null ? board.avg_rating.toFixed(1) : null;
  const techPreview = (board.used_libraries ?? []).slice(0, 2);
  const subtitle =
    [board.subject, board.grade].filter((s) => Boolean(s) && String(s).trim() !== '').join(' · ') || 'Ohne Angabe';
  return (
    <Link
      to={`/app/boards/library/${board.id}`}
      aria-label={`${board.title || 'Board'} — Vorschau öffnen`}
      className={cn(
        'group relative flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm outline-none ring-indigo-400/80',
        'transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        'focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-app)]',
        'sm:w-[280px]',
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
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-slate-950/35 to-transparent opacity-80 transition-opacity duration-200 group-hover:opacity-95"
        />
        <BoardLibraryThumbnail
          boardId={board.id}
          html={board.html}
          css={board.css}
          javascript={board.javascript}
          usedLibraries={board.used_libraries ?? []}
          usedDatasets={board.used_datasets}
          density="comfortable"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pb-2.5 pt-2.5">
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight text-slate-900 sm:text-[14.5px]">
          {board.title || 'Ohne Titel'}
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-500">
          <span className="line-clamp-1">{subtitle}</span>
          <LibraryPlannedDuration minutes={board.planned_duration_minutes} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11.5px] text-slate-500">
          <div className="flex flex-wrap items-center gap-x-2.5">
            <span className="inline-flex items-center gap-1 tabular-nums text-slate-700">
              <Star size={12} strokeWidth={2} className="shrink-0 text-amber-500" aria-hidden />
              <span className="font-medium">{ratingCompact ?? '—'}</span>
              <span className="font-normal text-slate-400">({board.rating_count})</span>
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MessageCircle size={12} strokeWidth={2} className="shrink-0 text-indigo-500" aria-hidden />
              {board.comment_count ?? 0}
            </span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-indigo-700 ring-1 ring-indigo-100/80 transition-colors group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-500">
            Ansehen
            <ChevronRight size={12} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
};

const ContinueCard = ({ item }: { item: ContinueItem }) => {
  const isBoard = item.kind === 'board';
  const href = isBoard ? `/app/boards/${item.id}` : `/app/worksheets/${item.id}`;
  const subjectCanonical = canonicalSubjectLabel(item.subject ?? '');
  const subjectLabel = subjectCanonical && subjectCanonical !== 'Andere' ? subjectCanonical : item.subject || 'Ohne Fach';
  const gradeLabel = isBoard
    ? item.grade
    : item.grade != null
      ? `Klasse ${item.grade}`
      : null;
  const updatedLabel = item.updated_at ? formatRelative(item.updated_at) : null;
  const accent = subjectAccent(subjectLabel);

  return (
    <Link
      to={href}
      aria-label={`${item.title || 'Ohne Titel'} öffnen`}
      className={cn(
        'group relative flex w-[230px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm outline-none ring-indigo-400/80',
        'transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        'focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-app)]',
        'sm:w-[240px]',
      )}
    >
      <div
        className={cn(
          'relative grid h-[6.5rem] place-items-center overflow-hidden',
          accent.bg,
        )}
      >
        <div className={cn('grid h-12 w-12 place-items-center rounded-2xl bg-white/85 shadow-sm', accent.fg)}>
          {isBoard ? <Presentation size={22} aria-hidden /> : <FileText size={22} aria-hidden />}
        </div>
        <span className={cn('absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', accent.pill)}>
          {isBoard ? 'Smartboard' : 'Arbeitsblatt'}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-3 pb-2.5 pt-2.5">
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight text-slate-900">
          {item.title || 'Ohne Titel'}
        </h3>
        <p className="line-clamp-1 text-[12px] text-slate-500">
          {[subjectLabel, gradeLabel].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          <span className="truncate">{updatedLabel ?? '—'}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-indigo-700 ring-1 ring-indigo-100/80 transition-colors group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-500">
            Öffnen
            <ChevronRight size={12} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
};

type SubjectAccent = { bg: string; fg: string; pill: string };

/** Stabile Farbpalette pro kanonischem Fach — psychologisch gewählt (kühl/warm passend). */
const SUBJECT_ACCENTS: Record<string, SubjectAccent> = {
  Mathematik: { bg: 'bg-indigo-100', fg: 'text-indigo-700', pill: 'bg-indigo-600/90 text-white' },
  Deutsch: { bg: 'bg-amber-100', fg: 'text-amber-800', pill: 'bg-amber-600/90 text-white' },
  Englisch: { bg: 'bg-rose-100', fg: 'text-rose-700', pill: 'bg-rose-600/90 text-white' },
  Sachunterricht: { bg: 'bg-emerald-100', fg: 'text-emerald-700', pill: 'bg-emerald-600/90 text-white' },
  Biologie: { bg: 'bg-emerald-100', fg: 'text-emerald-700', pill: 'bg-emerald-600/90 text-white' },
  Physik: { bg: 'bg-sky-100', fg: 'text-sky-700', pill: 'bg-sky-600/90 text-white' },
  Chemie: { bg: 'bg-teal-100', fg: 'text-teal-700', pill: 'bg-teal-600/90 text-white' },
  Geschichte: { bg: 'bg-stone-100', fg: 'text-stone-700', pill: 'bg-stone-600/90 text-white' },
  Erdkunde: { bg: 'bg-lime-100', fg: 'text-lime-800', pill: 'bg-lime-600/90 text-white' },
  Musik: { bg: 'bg-fuchsia-100', fg: 'text-fuchsia-700', pill: 'bg-fuchsia-600/90 text-white' },
  Kunst: { bg: 'bg-orange-100', fg: 'text-orange-700', pill: 'bg-orange-600/90 text-white' },
  Sport: { bg: 'bg-cyan-100', fg: 'text-cyan-700', pill: 'bg-cyan-600/90 text-white' },
  Informatik: { bg: 'bg-violet-100', fg: 'text-violet-700', pill: 'bg-violet-600/90 text-white' },
  Religion: { bg: 'bg-yellow-100', fg: 'text-yellow-800', pill: 'bg-yellow-600/90 text-white' },
  Ethik: { bg: 'bg-yellow-100', fg: 'text-yellow-800', pill: 'bg-yellow-600/90 text-white' },
};

const FALLBACK_ACCENT: SubjectAccent = {
  bg: 'bg-slate-100',
  fg: 'text-slate-700',
  pill: 'bg-slate-600/90 text-white',
};

const subjectAccent = (label: string): SubjectAccent => SUBJECT_ACCENTS[label] ?? FALLBACK_ACCENT;

const ThemeChipsSection = ({ chips }: { chips: { label: string; count: number }[] }) => {
  if (chips.length === 0) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
          <Users size={16} aria-hidden />
        </div>
        <div>
          <h2 className="text-[15px] font-bold tracking-tight text-slate-900 sm:text-[16px]">
            Themenwelten entdecken
          </h2>
          <p className="text-[12.5px] text-slate-500">
            Beliebte Fächer aus der Bibliothek — direkt einsteigen und stöbern.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.label}
            to={`/app/boards/library?subject=${encodeURIComponent(c.label)}&kind=boards`}
            className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800"
          >
            <span>{c.label}</span>
            {c.count > 0 ? (
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500 ring-1 ring-slate-200 group-hover:text-indigo-600">
                {c.count}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
};

const SkeletonContinueCard = () => (
  <div className="w-[230px] shrink-0 snap-start animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:w-[240px]">
    <div className="h-[6.5rem] bg-slate-100" />
    <div className="space-y-2 p-3">
      <div className="h-3 w-3/4 rounded bg-slate-200" />
      <div className="h-2.5 w-1/2 rounded bg-slate-100" />
      <div className="mt-2 h-2 w-1/3 rounded bg-slate-100" />
    </div>
  </div>
);

const SkeletonLibraryCard = () => (
  <div className="w-[260px] shrink-0 snap-start animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:w-[280px]">
    <div className="aspect-video bg-slate-100" />
    <div className="space-y-2 p-3">
      <div className="h-3 w-3/4 rounded bg-slate-200" />
      <div className="h-2.5 w-1/2 rounded bg-slate-100" />
      <div className="mt-2 flex justify-between">
        <div className="h-3 w-12 rounded bg-slate-100" />
        <div className="h-3 w-12 rounded bg-slate-100" />
      </div>
    </div>
  </div>
);

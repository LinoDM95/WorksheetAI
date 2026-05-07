import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, MessageCircle, Plus, Presentation, Sparkles, Star, Users } from 'lucide-react';
import type { BoardLibraryItem } from '../boards/types';
import { BoardLibraryThumbnail } from '../boards/components/library/BoardLibraryThumbnail';
import { LibraryPlannedDuration } from '../boards/components/library/LibraryPlannedDuration';
import { LIBRARY_TECH_LABELS } from '../boards/lib/boardLibraryLabels';
import { canonicalSubjectLabel } from '../boards/lib/libraryCatalogFilters';
import { formatRelative } from '../../lib/formatDate';
import { Button, IconButton } from '../../components/ui';
import { cn } from '../../lib/cn';
import { subjectAccent } from './dashboardConstants';
import type { ContinueItem } from './dashboardTypes';

export const HeroHeader = ({ greeting, greetingName }: { greeting: string; greetingName?: string }) => (
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

export const ContinueSection = ({ items, loading }: { items: ContinueItem[]; loading: boolean }) => {
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

export const LibraryRow = ({
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

export const ThemeChipsSection = ({ chips }: { chips: { label: string; count: number }[] }) => {
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

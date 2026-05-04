import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, List } from 'lucide-react';
import {
  PATTERNS_LIST_QUERY_KEY,
  WORKSHEET_LIST_STALE_MS,
  fetchPatternsList,
} from '../../lib/listQueries';
import type { Pattern } from '../../types';
import { PatternMiniPreview, type PatternPreviewType } from '../../components/PatternMiniPreview';
import { UpcomingBadge } from '../../components/UpcomingBadge';
import { Alert, Card, EmptyState, IconButton, PageHeader, SearchInput } from '../../components/ui';
import { cn } from '../../lib/cn';

const PREVIEW_TYPE = (name: string): PatternPreviewType => {
  const n = name.toLowerCase();
  if (
    n.includes('rechen') ||
    n.includes('mathe') ||
    n.includes('addition') ||
    n.includes('subtrakt') ||
    n.includes('multiplik')
  )
    return 'rechen';
  if (n.includes('sachtext') || n.includes('lückentext') || n.includes('lese')) return 'sachtext';
  if (n.includes('forscher')) return 'forscher';
  if (n.includes('akadem') || n.includes('uni') || n.includes('klausur')) return 'akademisch';
  return 'kreativ';
};

const FILTER_TAGS = ['alle', 'mathematik', 'deutsch', 'sachfächer', 'sprachen'] as const;

export function PatternLibraryPage() {
  const { data: patterns = [], isPending: loading, isError } = useQuery({
    queryKey: PATTERNS_LIST_QUERY_KEY,
    queryFn: () => fetchPatternsList<Pattern>(),
    staleTime: WORKSHEET_LIST_STALE_MS,
  });
  const err = isError ? 'Vorlagen konnten nicht geladen werden.' : '';
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<(typeof FILTER_TAGS)[number]>('alle');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return patterns.filter((p) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.key ?? '').toLowerCase().includes(q);
      if (!matchesQuery) return false;
      if (filter === 'alle') return true;
      const haystack = `${p.name} ${p.description ?? ''}`.toLowerCase();
      return haystack.includes(filter);
    });
  }, [patterns, filter, query]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5">
      <PageHeader
        title="Vorlagen"
        subtitle={
          <>
            Überblick über Blueprints für die KI. Die direkte Vorlagenwahl auf dieser Seite folgt —{' '}
            <strong className="font-semibold text-slate-700">aktuell startest du über „Neues Arbeitsblatt erstellen“</strong>{' '}
            im Assistenten (automatische Vorlagenpassung).
          </>
        }
      />

      <Card flush className="flex flex-wrap items-center gap-2.5 p-3.5">
        <SearchInput
          containerClassName="min-w-[240px]"
          placeholder="Vorlagen durchsuchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Vorlagen-Suche"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TAGS.map((f) => (
            <button
              key={f}
              type="button"
              className="chip capitalize"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
          <IconButton
            aria-label="Kachel-Ansicht"
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
            className={cn(view === 'grid' && 'bg-white shadow-[var(--shadow-xs)]')}
          >
            <LayoutGrid size={14} />
          </IconButton>
          <IconButton
            aria-label="Listen-Ansicht"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            className={cn(view === 'list' && 'bg-white shadow-[var(--shadow-xs)]')}
          >
            <List size={14} />
          </IconButton>
        </div>
      </Card>

      {err && <Alert tone="error">{err}</Alert>}

      {loading ? (
        <p className="text-sm text-slate-500">Lade Vorlagen…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="Keine Vorlagen gefunden" description="Passe die Suche oder die Filter an." />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PatternGridCard key={p.id} pattern={p} />
          ))}
        </div>
      ) : (
        <Card flush overflowHidden>
          <ul className="divide-y divide-slate-200">
            {filtered.map((p) => (
              <PatternListRow key={p.id} pattern={p} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

const PatternGridCard = ({ pattern }: { pattern: Pattern }) => (
  <div
    className="group relative flex cursor-default flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-slate-300 hover:shadow-md"
    role="group"
    aria-label={`${pattern.name} — demnächst verfügbar`}
  >
    <div className="relative flex min-h-[11rem] flex-[1.2] items-center justify-center bg-gray-100 p-4">
      <PatternMiniPreview type={PREVIEW_TYPE(pattern.name)} />
      <span className="pointer-events-none absolute right-2.5 top-2.5">
        <UpcomingBadge />
      </span>
    </div>
    <div className="flex flex-[0.9] flex-col p-4">
      <h3 className="text-base font-bold leading-snug tracking-tight text-slate-900">{pattern.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500">
        {pattern.description || 'Keine Beschreibung hinterlegt.'}
      </p>
      <code className="mt-2 block truncate font-mono text-[11px] text-slate-400">{pattern.key}</code>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        <SubtleStatusPill status={pattern.status} />
        {pattern.is_system ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium lowercase text-slate-600">
            bibliothek
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium lowercase text-slate-600">
            erweiterung
          </span>
        )}
      </div>
    </div>
  </div>
);

const PatternListRow = ({ pattern }: { pattern: Pattern }) => (
  <li
    className="flex cursor-default flex-wrap items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/80 sm:flex-nowrap"
    aria-label={`${pattern.name} — demnächst verfügbar`}
  >
    <div className="relative grid h-14 w-[3.25rem] shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200/90 bg-gray-100">
      <div className="origin-center scale-[0.42]">
        <PatternMiniPreview type={PREVIEW_TYPE(pattern.name)} />
      </div>
      <span className="pointer-events-none absolute right-0.5 top-0.5 scale-[0.85] origin-top-right">
        <UpcomingBadge className="!px-1 !py-px !text-[9px]" />
      </span>
    </div>
    <div className="min-w-0 flex-1">
      <div className="font-semibold text-slate-900">{pattern.name}</div>
      <div className="mt-0.5 line-clamp-2 text-sm text-slate-500">{pattern.description}</div>
      <code className="mt-1 block font-mono text-[11px] text-slate-400">{pattern.key}</code>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex-col sm:items-end">
      <SubtleStatusPill status={pattern.status} />
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] lowercase text-slate-600">
        {pattern.is_system ? 'bibliothek' : 'erweiterung'}
      </span>
      <UpcomingBadge />
    </div>
  </li>
);

const SubtleStatusPill = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    active: 'aktiv',
    draft: 'entwurf',
    archived: 'archiv',
  };
  const label = map[status] ?? status.toLowerCase();
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium lowercase text-slate-600">
      {label}
    </span>
  );
};

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Book,
  CheckCircle2,
  FileText,
  Grid3X3,
  GraduationCap,
  Layers,
  LayoutGrid,
  Lightbulb,
  Pencil,
  Plus,
  Save,
  Share2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { Pattern, Worksheet } from '../../types';
import {
  PATTERNS_LIST_QUERY_KEY,
  WORKSHEET_LIST_QUERY_KEY,
  WORKSHEET_LIST_STALE_MS,
  fetchPatternsList,
  fetchWorksheetList,
} from '../../lib/listQueries';
import { formatLongDate, formatRelative } from '../../lib/formatDate';
import { MockBadge } from '../../components/MockBadge';
import { UpcomingBadge } from '../../components/UpcomingBadge';
import { Button, MiniThumbnail, SectionCard, StatCard, StatusBadge } from '../../components/ui';

type RecentItem = Pick<Worksheet, 'id' | 'title' | 'subject' | 'grade' | 'status' | 'updated_at'>;

type QuickAction = { icon: LucideIcon; label: string; desc: string };

const QUICK_ACTIONS: QuickAction[] = [
  { icon: Grid3X3, label: 'Rechenblatt', desc: 'Kästchenformat mit großen Zahlen — Kl. 1–6' },
  { icon: Pencil, label: 'Lückentext', desc: 'Text mit fehlenden Wörtern, Lösungsblatt' },
  { icon: Book, label: 'Lesetext + Fragen', desc: 'Sachtext mit gestaffelten Verständnisfragen' },
  { icon: Layers, label: 'Matching', desc: 'Begriffe und Bilder zuordnen' },
  { icon: Lightbulb, label: 'Forscherbogen', desc: 'Beobachtung, Vermutung, Versuch, Auswertung' },
  { icon: CheckCircle2, label: 'Klausurtraining', desc: 'Aufgabentypen wie in der Abschlussprüfung' },
  { icon: GraduationCap, label: 'Uni / Oberstufe', desc: 'Akademisches Aufgabenblatt mit Punkten' },
  { icon: Sparkles, label: 'Frei beschreiben', desc: 'Beschreibe das Blatt in deinen Worten' },
];

export function DashboardPage() {
  const { data: wsData, isPending: worksheetsPending, isError: worksheetsError } = useQuery({
    queryKey: WORKSHEET_LIST_QUERY_KEY,
    queryFn: () => fetchWorksheetList<RecentItem>(),
    staleTime: WORKSHEET_LIST_STALE_MS,
  });
  const { data: patData, isPending: patternsPending, isError: patternsError } = useQuery({
    queryKey: PATTERNS_LIST_QUERY_KEY,
    queryFn: () => fetchPatternsList<Pattern>(),
    staleTime: WORKSHEET_LIST_STALE_MS,
  });

  const worksheets: RecentItem[] | null = worksheetsPending ? null : worksheetsError ? [] : (wsData ?? []);
  const patterns: Pattern[] | null = patternsPending ? null : patternsError ? [] : (patData ?? []);

  const recent = useMemo(() => (worksheets ?? []).slice(0, 5), [worksheets]);
  const recommended = useMemo(() => (patterns ?? []).slice(0, 4), [patterns]);
  const today = useMemo(() => formatLongDate(), []);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-7">
      <HeroSection today={today} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Überblick</h2>
          <MockBadge
            variant="banner"
            label="Statistiken sind Mockup-Daten"
            tooltip="Diese Zahlen sind Beispieldaten. Sobald die Statistik-API verfügbar ist, werden echte Werte angezeigt."
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Erstellte Arbeitsblätter"
            value={worksheets ? String(worksheets.length) : '—'}
            hint="+6 diese Woche"
            icon={FileText}
            tone="primary"
          />
          <StatCard
            label="Aktive Vorlagen"
            value={patterns ? String(patterns.length) : '—'}
            hint="2 neu"
            icon={LayoutGrid}
            tone="success"
          />
          <StatCard label="Gespeicherte Entwürfe" value="3" hint="Letzter: gestern" icon={Save} tone="accent" />
          <StatCard label="Geteilt im Kollegium" value="8" hint="3 Kollegen" icon={Share2} tone="neutral" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Schnellaktionen</h2>
          <span className="hidden text-sm text-slate-500 sm:inline">
            Kurzstarter demnächst — bis dahin „Neues Arbeitsblatt erstellen“ nutzen
          </span>
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map((qa) => (
            <QuickActionCard key={qa.label} {...qa} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
        <RecentSection items={recent} loading={worksheets === null} />
        <RecommendedSection items={recommended} loading={patterns === null} />
      </section>
    </div>
  );
}

const HeroSection = ({ today }: { today: string }) => (
  <section
    className="relative overflow-hidden rounded-[18px] px-6 py-7 text-white shadow-md sm:px-8"
    style={{ background: 'linear-gradient(120deg, #4f46e5 0%, #4338ca 60%, #3730a3 100%)' }}
  >
    <FileText
      size={220}
      strokeWidth={1}
      className="pointer-events-none absolute -right-5 -top-5 text-white/10"
      aria-hidden
    />
    <div className="text-[13px] font-medium text-indigo-200">{today}</div>
    <h2 className="mt-1 max-w-2xl text-2xl font-bold tracking-tight sm:text-[26px]">Guten Morgen.</h2>
    <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-indigo-100">
      Neue Stunde vorbereiten? Beschreibe Thema und Niveau, die KI baut das druckfertige
      Arbeitsblatt nach deiner Vorlage.
    </p>
    <div className="mt-5 flex flex-wrap gap-2.5">
      <Button
        as="link"
        to="/app/create"
        size="lg"
        variant="secondary"
        className="border-transparent !bg-white !text-indigo-700 hover:!bg-indigo-50"
        leftIcon={<Plus size={16} aria-hidden />}
      >
        Neues Arbeitsblatt erstellen
      </Button>
      <Button
        as="link"
        to="/app/patterns"
        size="lg"
        variant="ghost"
        className="border border-white/25 !bg-white/10 !text-white hover:!bg-white/20"
        leftIcon={<LayoutGrid size={16} aria-hidden />}
      >
        Vorlagen & Freischaltungen
      </Button>
    </div>
  </section>
);

const QuickActionCard = ({ icon: Icon, label, desc }: QuickAction) => (
  <div
    className="group flex h-full cursor-default flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white text-left shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-slate-300 hover:shadow-md"
    role="group"
    aria-label={`${label} — demnächst verfügbar`}
  >
    <div className="relative flex min-h-[6.25rem] items-center justify-center bg-gray-100 px-3 py-4">
      <div className="grid h-11 w-11 place-items-center rounded-[10px] border border-slate-200/80 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <Icon size={20} aria-hidden />
      </div>
      <span className="pointer-events-none absolute right-2 top-2">
        <UpcomingBadge />
      </span>
    </div>
    <div className="flex flex-1 flex-col p-4">
      <h3 className="text-sm font-bold leading-snug tracking-tight text-slate-900">{label}</h3>
      <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-slate-500">{desc}</p>
    </div>
  </div>
);

const RecentSection = ({ items, loading }: { items: RecentItem[]; loading: boolean }) => (
  <SectionCard
    title="Zuletzt bearbeitet"
    description="Deine letzten Arbeitsblätter"
    actions={
      <Button as="link" to="/app/worksheets" variant="ghost" size="sm" rightIcon={<ArrowRight size={13} aria-hidden />}>
        Alle ansehen
      </Button>
    }
  >
    {loading ? (
      <div className="px-5 py-8 text-sm text-slate-500">Lade Arbeitsblätter…</div>
    ) : items.length === 0 ? (
      <div className="px-5 py-8 text-sm text-slate-500">
        Noch keine Arbeitsblätter.{' '}
        <Link to="/app/create" className="font-semibold text-indigo-600 hover:underline">
          Jetzt das erste erstellen →
        </Link>
      </div>
    ) : (
      <ul className="divide-y divide-slate-200">
        {items.map((w) => (
          <RecentRow key={w.id} item={w} />
        ))}
      </ul>
    )}
  </SectionCard>
);

const RecentRow = ({ item }: { item: RecentItem }) => {
  const editHref = `/app/worksheets/${item.id}`;
  const subtitle =
    [item.subject, item.grade != null ? `Kl. ${item.grade}` : null].filter(Boolean).join(' · ') || '—';
  return (
    <li className="grid items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:grid-cols-[40px_1fr_auto_auto_auto] sm:px-5">
      <MiniThumbnail size="sm" />
      <div className="min-w-0">
        <Link
          to={editHref}
          className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-700"
        >
          {item.title || 'Ohne Titel'}
        </Link>
        <div className="mt-0.5 truncate text-[12px] text-slate-500">{subtitle}</div>
      </div>
      <StatusBadge status={item.status ?? 'draft'} />
      <span className="hidden text-[12px] text-slate-500 sm:inline">
        {formatRelative(item.updated_at as string)}
      </span>
      <Button as="link" to={editHref} variant="ghost" size="sm">
        Öffnen
      </Button>
    </li>
  );
};

const RecommendedSection = ({ items, loading }: { items: Pattern[]; loading: boolean }) => (
  <SectionCard title="Empfohlene Vorlagen" description="Passend zu deinen Fächern">
    {loading ? (
      <div className="px-5 py-6 text-sm text-slate-500">Lade Vorlagen…</div>
    ) : items.length === 0 ? (
      <div className="px-5 py-6 text-sm text-slate-500">
        Noch keine Vorlagen verfügbar.{' '}
        <Link to="/app/patterns" className="font-semibold text-indigo-600 hover:underline">
          Zur Vorlagenbibliothek →
        </Link>
      </div>
    ) : (
      <div className="flex flex-col gap-2.5 p-4">
        {items.map((p) => (
          <Link
            key={p.id}
            to="/app/patterns"
            className="flex items-center gap-3 rounded-[10px] border border-slate-200 p-2.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
          >
            <MiniThumbnail size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-slate-900">{p.name}</div>
              <div className="truncate text-[11.5px] text-slate-500">{p.description}</div>
            </div>
          </Link>
        ))}
      </div>
    )}
  </SectionCard>
);

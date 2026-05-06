import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  FileText,
  Filter,
  Info,
  Clock,
  LayoutGrid,
  Printer,
  RotateCcw,
  Share2,
  Shield,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  PATTERNS_LIST_QUERY_KEY,
  WORKSHEET_LIST_QUERY_KEY,
  WORKSHEET_LIST_STALE_MS,
  fetchPatternsList,
} from '../../lib/listQueries';
import type { Pattern, Worksheet } from '../../types';
import { A4Preview } from '../../components/A4Preview';
import { MockBadge } from '../../components/MockBadge';
import { PatternMiniPreview, type PatternPreviewType } from '../../components/PatternMiniPreview';
import { Alert, Button } from '../../components/ui';
import { cn } from '../../lib/cn';
import {
  audienceDisplayLabel,
  buildGeneratePayload,
  deriveAudienceFromSchoolContext,
  type WizardColorMode,
  type WizardDecoLevel,
  type WizardDesignStyle,
  type WizardOrientation,
  type WizardRenderer,
  type WizardState,
} from './wizardState';
import { useWizardState, type WizardActions } from './useWizardState';
import { FieldRow, RadioGroup, SectionHeading, Stepper } from './components';
import { useShellChrome } from '../../components/shell/ShellChromeContext';

const STEP_LABELS = ['Inhalt', 'Vorlage', 'Design & Seite', 'Prüfen', 'Export'];
const STEP_NEXT_LABELS = [
  'Weiter zur Vorlage',
  'Weiter zum Design',
  'Inhalte prüfen',
  'Zum Export',
] as const;

export function WizardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { breadcrumbBackHref, breadcrumbBackLabel } = useShellChrome();
  const { state, actions } = useWizardState();
  const [step, setStep] = useState(0);
  const { data: patterns = [] } = useQuery({
    queryKey: PATTERNS_LIST_QUERY_KEY,
    queryFn: () => fetchPatternsList<Pattern>(),
    staleTime: WORKSHEET_LIST_STALE_MS,
  });
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateProgress, setGenerateProgress] = useState(0);
  const progressStop = useRef(false);

  /** Vorlagen-Schritt: nur KI-gestützte Auswahl — keine feste Vorlage aus der Liste. */
  useEffect(() => {
    if (step !== 1) return;
    actions.clearPattern();
  }, [step, actions]);

  useEffect(() => {
    if (!generating) return;
    progressStop.current = false;
    setGenerateProgress(0);
    const id = window.setInterval(() => {
      if (progressStop.current) return;
      setGenerateProgress((p) => (p >= 92 ? p : Math.min(92, p + (92 - p) * 0.035 + 0.35)));
    }, 60);
    return () => window.clearInterval(id);
  }, [generating]);

  const handleGenerate = async () => {
    setGenerateError(null);
    setGenerating(true);
    try {
      const payload = buildGeneratePayload(state);
      const r = await api.post('/worksheets/generate/', payload);
      progressStop.current = true;
      setGenerateProgress(100);
      await new Promise((res) => window.setTimeout(res, 200));
      const ws = r.data as Worksheet;
      void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      try {
        sessionStorage.setItem(`worksheet-curriculum-hint:${ws.id}`, '1');
      } catch {
        /* ignore quota / private mode */
      }
      navigate(`/app/worksheets/${ws.id}`);
    } catch (err) {
      progressStop.current = true;
      let msg = 'Generierung fehlgeschlagen.';
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const d = err.response?.data as
          | { detail?: string; error_code?: string }
          | undefined;
        if (typeof d?.detail === 'string') {
          msg = d.detail;
        } else if (err.message) {
          msg = err.message;
        } else if (status === 504) {
          msg =
            'Zeitüberschreitung bei der KI (DEADLINE_EXCEEDED). Bitte später erneut versuchen oder kürzeren Auftrag wählen.';
        } else if (status === 429) {
          msg = 'Kapazitätsgrenze (429). Bitte später erneut versuchen.';
        } else if (status === 404) {
          msg = 'Die gewählte Vorlage wurde nicht gefunden.';
        }
      }
      setGenerateError(msg);
      setGenerateProgress(0);
    } finally {
      setGenerating(false);
    }
  };

  const handleNext = () => {
    if (step < 4) setStep((s) => s + 1);
    else void handleGenerate();
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => navigate(breadcrumbBackHref)}
          title={`Zurück zu ${breadcrumbBackLabel}`}
          aria-label={`Zurück zu ${breadcrumbBackLabel}`}
          leftIcon={<ArrowLeft size={14} aria-hidden />}
        >
          Zurück
        </Button>
        <div className="hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
        <div className="min-w-0 flex-1">
          <Stepper step={step} steps={STEP_LABELS} onStepClick={(i) => setStep(i)} />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-bg-app)]">
        <div className="mx-auto w-full max-w-[1280px] px-3 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom,12px))] sm:px-6 lg:px-8 lg:pt-8 lg:pb-[max(2rem,env(safe-area-inset-bottom,12px))]">
          {step === 0 && <StepInhalt state={state} actions={actions} />}
          {step === 1 && (
            <StepVorlage state={state} actions={actions} patterns={patterns} />
          )}
          {step === 2 && <StepDesign state={state} actions={actions} />}
          {step === 3 && <StepPruefen state={state} patterns={patterns} />}
          {step === 4 && (
            <StepExport
              state={state}
              generating={generating}
              progress={generateProgress}
              error={generateError}
              onGenerate={handleGenerate}
            />
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:gap-3 lg:px-8">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Schritt zurück
          </Button>
        )}
        {step < 4 ? (
          <Button onClick={handleNext} rightIcon={<ArrowRight size={15} aria-hidden />}>
            {STEP_NEXT_LABELS[step]}
          </Button>
        ) : (
          <Button
            variant="success"
            onClick={() => void handleGenerate()}
            disabled={generating}
            leftIcon={<Check size={15} aria-hidden />}
          >
            Fertigstellen & Generieren
          </Button>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Step 1 — Inhalt
   ========================================================= */
const StepInhalt = ({
  state,
  actions,
}: {
  state: WizardState;
  actions: WizardActions;
}) => {
  const set = actions.setField;
  return (
    <div className="card p-5 sm:p-6">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Inhalt &amp; Lerngruppe</h2>
        <p className="mb-5 text-[13.5px] leading-relaxed text-slate-500">
          Beschreibe, was auf dem Blatt stehen soll. Pflichtfelder oben — alles weitere ist optional und
          hilft der KI, näher an deinem Unterricht zu arbeiten.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Thema" htmlFor="w-topic" span={2}>
            <input
              id="w-topic"
              className="input"
              value={state.topic}
              onChange={(e) => set('topic', e.target.value)}
              placeholder="z. B. Photosynthese, Französische Revolution …"
            />
          </FieldRow>
          <FieldRow label="Fach / Kurs" htmlFor="w-subject">
            <input
              id="w-subject"
              className="input"
              value={state.subject}
              onChange={(e) => set('subject', e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Klassenstufe" htmlFor="w-grade">
            <input
              id="w-grade"
              type="text"
              inputMode="numeric"
              className="input"
              value={state.grade}
              onChange={(e) => set('grade', e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Schulform" htmlFor="w-school">
            <select
              id="w-school"
              className="select"
              value={state.schoolForm}
              onChange={(e) => set('schoolForm', e.target.value)}
            >
              {['Grundschule', 'Gesamtschule', 'Realschule', 'Gymnasium', 'Berufliche Schule', 'Hochschule'].map(
                (o) => (
                  <option key={o}>{o}</option>
                ),
              )}
            </select>
          </FieldRow>
          <FieldRow label="Bundesland" htmlFor="w-state">
            <select
              id="w-state"
              className="select"
              value={state.state}
              onChange={(e) => set('state', e.target.value)}
            >
              {[
                'Baden-Württemberg',
                'Bayern',
                'Berlin',
                'Brandenburg',
                'Bremen',
                'Hamburg',
                'Hessen',
                'Mecklenburg-Vorpommern',
                'Niedersachsen',
                'NRW',
                'Rheinland-Pfalz',
                'Saarland',
                'Sachsen',
                'Sachsen-Anhalt',
                'Schleswig-Holstein',
                'Thüringen',
              ].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </FieldRow>
        </div>

        <div className="divider my-6" />

        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600">
          Die sprachliche Zielgruppe für die KI (<strong className="font-semibold text-slate-700">Grundschule</strong>{' '}
          bis <strong className="font-semibold text-slate-700">Hochschule</strong>) wird automatisch aus{' '}
          <strong className="font-semibold text-slate-700">Schulform</strong> und{' '}
          <strong className="font-semibold text-slate-700">Klassenstufe</strong> abgeleitet — Gymnasium Klasse&nbsp;12
          z.&nbsp;B. als Oberstufe, Klasse&nbsp;9 als Mittelstufe.
        </p>

        <FieldRow
          label="Lernziel"
          help="Was sollen die Schüler nach dem Blatt können? In ein bis zwei Sätzen."
          htmlFor="w-goal"
        >
          <textarea
            id="w-goal"
            rows={2}
            className="textarea"
            value={state.learningGoal}
            onChange={(e) => set('learningGoal', e.target.value)}
          />
        </FieldRow>

        <div className="mt-4">
          <FieldRow label="Aufgabenart">
            <div className="flex flex-wrap gap-2">
              {[
                ['practice', 'Üben / Festigen'],
                ['introduction', 'Einstieg'],
                ['homework', 'Hausaufgabe'],
                ['quiz', 'Kurztest'],
                ['exam_prep', 'Prüfungsvorbereitung'],
                ['station_work', 'Stationen'],
                ['reflection', 'Reflexion'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  aria-pressed={state.worksheetType === id}
                  onClick={() => set('worksheetType', id as string)}
                >
                  {label}
                </button>
              ))}
            </div>
          </FieldRow>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FieldRow label="Schwierigkeit" htmlFor="w-difficulty">
            <select
              id="w-difficulty"
              className="select"
              value={state.difficulty}
              onChange={(e) => set('difficulty', e.target.value)}
            >
              <option value="basic">Grundlegend</option>
              <option value="standard">Standard</option>
              <option value="advanced">Anspruchsvoll</option>
              <option value="expert">Experte</option>
            </select>
          </FieldRow>
          <FieldRow label="Dauer (Min.)" htmlFor="w-duration">
            <select
              id="w-duration"
              className="select"
              value={state.duration}
              onChange={(e) => set('duration', e.target.value)}
            >
              {['15', '30', '45', '60', '90'].map((d) => (
                <option key={d} value={d}>
                  {d} Min
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Sprache" htmlFor="w-lang">
            <select
              id="w-lang"
              className="select"
              value={state.language}
              onChange={(e) => set('language', e.target.value)}
            >
              <option value="de">Deutsch</option>
              <option value="de_simple">Deutsch (einfach)</option>
              <option value="en">Englisch</option>
              <option value="fr">Französisch</option>
            </select>
          </FieldRow>
        </div>

        <div className="mt-4">
          <FieldRow
            label="Zusatzwünsche / Lehrer-Prompt"
            help="Didaktischer Schwerpunkt, typische Missverständnisse deiner Klasse, Tabus (z. B. „kein Taschenrechner“). Hat Vorrang vor der Vorlage."
            htmlFor="w-prompt"
          >
            <textarea
              id="w-prompt"
              rows={3}
              className="textarea"
              value={state.teacherPrompt}
              onChange={(e) => set('teacherPrompt', e.target.value)}
              placeholder="z. B. Fokus auf …, vermeide …, Lösungen ausführlich"
            />
          </FieldRow>
        </div>
        <div className="mt-3">
          <MockBadge
            variant="inline"
            label="KI-Aufgaben-Generierung"
            tooltip="Die KI-Generierung läuft erst beim Klick auf „Fertigstellen“ in Schritt 5. Eine Zwischenvorschau der Aufgaben ist hier (noch) ein Mockup."
          />
        </div>
    </div>
  );
};

/* =========================================================
   Step 2 — Vorlage
   ========================================================= */
const PATTERN_PREVIEW_HEURISTIC = (name: string): PatternPreviewType => {
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
  if (n.includes('forscher') || n.includes('experiment')) return 'forscher';
  if (n.includes('akadem') || n.includes('uni') || n.includes('klausur')) return 'akademisch';
  return 'kreativ';
};

const FALLBACK_PATTERNS = [
  {
    name: 'Große Rechenkästchen',
    subjects: 'Mathematik',
    grades: 'Kl. 1–4',
    style: ['Klassisch', 'Gitter'],
    recommended: false,
    previewType: 'rechen' as PatternPreviewType,
  },
  {
    name: 'Sachtext + Fragen',
    subjects: 'Deutsch / Sachfächer',
    grades: 'Kl. 3–10',
    style: ['Modern'],
    recommended: false,
    previewType: 'sachtext' as PatternPreviewType,
  },
  {
    name: 'Akademisches Aufgabenblatt',
    subjects: 'Sek II / Hochschule',
    grades: 'Kl. 11+',
    style: ['Akademisch'],
    recommended: true,
    previewType: 'akademisch' as PatternPreviewType,
  },
  {
    name: 'Forscherbogen',
    subjects: 'Bio / Physik / NW',
    grades: 'Kl. 5–10',
    style: ['Modern'],
    recommended: false,
    previewType: 'forscher' as PatternPreviewType,
  },
  {
    name: 'Kreatives Grundschulblatt',
    subjects: 'Alle Fächer',
    grades: 'Kl. 1–4',
    style: ['Verspielt'],
    recommended: false,
    previewType: 'kreativ' as PatternPreviewType,
  },
  {
    name: 'Lückentext-Blatt',
    subjects: 'Sprachen / Sach',
    grades: 'Kl. 3–10',
    style: ['Modern'],
    recommended: false,
    previewType: 'sachtext' as PatternPreviewType,
  },
];

const WizardPatternPreviewCard = ({
  pattern,
}: {
  pattern: Pattern | (typeof FALLBACK_PATTERNS)[number];
}) => {
  const isReal = 'id' in pattern;
  const name = pattern.name;
  const sub = isReal
    ? pattern.description ?? '—'
    : `${pattern.subjects} · ${pattern.grades}`;
  const previewType: PatternPreviewType = isReal
    ? PATTERN_PREVIEW_HEURISTIC(pattern.name)
    : pattern.previewType;
  const recommended = !isReal && pattern.recommended;
  const tags = isReal ? [pattern.status] : pattern.style;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[14px] border border-slate-200/90 bg-gradient-to-b from-slate-50 to-white text-left shadow-sm"
      role="group"
      aria-label={`${name} — Demnächst verfügbar`}
    >
      <div className="relative grid h-44 place-items-center border-b border-slate-200/80 bg-slate-100/60 p-3.5 opacity-70 grayscale">
        <PatternMiniPreview type={previewType} />
        <span className="pointer-events-none absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-full border border-white/70 bg-gradient-to-br from-violet-600 via-indigo-600 to-indigo-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-md shadow-indigo-900/25 ring-1 ring-inset ring-white/20">
          <Clock size={11} strokeWidth={2.25} className="opacity-95" aria-hidden />
          Demnächst
        </span>
      </div>
      <div className="flex flex-col p-3.5 opacity-75">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-bold text-slate-700">{name}</div>
          {recommended ? (
            <span className="badge badge-neutral text-[10.5px] opacity-80">Empfohlen</span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-slate-500">{sub}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.filter(Boolean).map((s, i) => (
            <span key={i} className="badge badge-neutral text-[10.5px] opacity-80">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const StepVorlage = ({
  state,
  actions,
  patterns,
}: {
  state: WizardState;
  actions: WizardActions;
  patterns: Pattern[];
}) => {
  const list = patterns.length === 0 ? FALLBACK_PATTERNS : patterns;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Vorlage wählen</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500">
            In diesem Schritt kannst du <strong className="font-semibold text-slate-700">Automatisch wählen</strong> —
            die KI ordnet passende Layouts zu. <strong className="font-semibold text-slate-700">Einzelvorlagen</strong>{' '}
            aus der Liste sind <span className="whitespace-nowrap">noch nicht wählbar</span> (Vorschau, demnächst).
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-2 opacity-40 grayscale pointer-events-none select-none"
          aria-hidden
          title="Folgt später"
        >
          <span className="chip" aria-pressed>
            Empfohlen
          </span>
          <span className="chip">{state.subject}</span>
          <span className="chip">Alle Fächer</span>
          <span className="btn btn-ghost btn-sm inline-flex items-center gap-1">
            <Filter size={13} aria-hidden /> Filter
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={actions.clearPattern}
        className={cn(
          'mb-5 w-full rounded-[14px] border-2 px-4 py-3 text-left transition-all',
          state.patternId === null
            ? 'border-indigo-500 bg-indigo-50 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]'
            : 'border-slate-200 bg-white hover:border-indigo-300',
        )}
      >
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="text-indigo-600" aria-hidden />
          <div className="flex-1">
            <div className="text-sm font-bold text-slate-900">Automatisch wählen</div>
            <div className="text-[12.5px] text-slate-500">
              Die KI wählt anhand von Fach, Klasse und Inhalt die passende Vorlage.
            </div>
          </div>
          {state.patternId === null && <Check size={18} className="text-indigo-600" aria-hidden />}
        </div>
      </button>

      <p className="mb-3 text-[12px] font-medium text-slate-500">Vorschau geplanter Vorlagen</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p, i) => {
          const isReal = 'id' in p;
          return (
            <WizardPatternPreviewCard
              key={isReal ? p.id : `fb-${i}`}
              pattern={p}
            />
          );
        })}
      </div>
    </div>
  );
};

/* =========================================================
   Step 3 — Design & Seite
   ========================================================= */
const StepDesign = ({
  state,
  actions,
}: {
  state: WizardState;
  actions: WizardActions;
}) => {
  const set = actions.setField;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="card h-fit p-5 sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">Design &amp; Seite</h2>
        <p className="mt-1 mb-5 text-[13.5px] leading-relaxed text-slate-500">
          Visuelle Anmutung und Druckparameter. Das Blatt rechts aktualisiert sich live.
        </p>

        <SectionHeading>Format</SectionHeading>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {(
            [
              { id: 'portrait', label: 'A4 Hochformat', icon: '210 × 297' },
              { id: 'landscape', label: 'A4 Querformat', icon: '297 × 210' },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={state.orientation === o.id}
              className="radio-card flex flex-col items-center gap-2 px-4 py-3.5"
              onClick={() => set('orientation', o.id as WizardOrientation)}
            >
              <FileText
                size={28}
                className={state.orientation === o.id ? 'text-indigo-600' : 'text-slate-500'}
                aria-hidden
              />
              <div className="text-[13px] font-semibold">{o.label}</div>
              <div className="text-[11px] text-slate-500">{o.icon} mm</div>
            </button>
          ))}
        </div>

        <SectionHeading>Ränder</SectionHeading>
        <div className="mb-2 flex items-center gap-2.5">
          <button
            type="button"
            className={cn('toggle', state.marginLinked && 'on')}
            onClick={actions.toggleMarginLink}
            aria-label="Alle Ränder koppeln"
            aria-pressed={state.marginLinked}
          />
          <span className="text-[13px] text-slate-700">Alle Ränder koppeln</span>
        </div>
        {state.marginLinked ? (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-700">Rand</span>
              <span className="tabular-nums text-xs text-slate-500">{state.marginValue} mm</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              value={state.marginValue}
              onChange={(e) => actions.setMarginValue(Number(e.target.value))}
              aria-label="Rand in mm"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
              <div key={k}>
                <label className="field-label mb-1">
                  {{ top: 'Oben', right: 'Rechts', bottom: 'Unten', left: 'Links' }[k]}:{' '}
                  <span className="font-medium text-slate-500">{state.margins[k]} mm</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={30}
                  value={state.margins[k]}
                  onChange={(e) => actions.setMargin(k, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        )}

        <div className="divider my-5" />
        <SectionHeading>Designstil</SectionHeading>
        <RadioGroup
          value={state.designStyle}
          onChange={(id) => set('designStyle', id as WizardDesignStyle)}
          columns={2}
          options={[
            { id: 'klassisch', label: 'Klassisch', sub: 'Schlicht, sachlich' },
            { id: 'modern', label: 'Modern', sub: 'Aufgeräumt, klar' },
            { id: 'grundschule', label: 'Grundschule', sub: 'Freundlich, größer' },
            { id: 'akademisch', label: 'Akademisch', sub: 'Serif, Punktevergabe' },
            { id: 'kreativ', label: 'Kreativ', sub: 'Mehr Variation' },
          ]}
        />

        <div className="mt-5 flex items-center justify-between">
          <SectionHeading>Farbmodus</SectionHeading>
          <MockBadge
            variant="inline"
            label="Deko-Level/Farbmodus"
            tooltip="Wirkt im Wizard nur visuell. Das echte Rendering wird im Editor angewendet."
          />
        </div>
        <RadioGroup
          value={state.colorMode}
          onChange={(id) => set('colorMode', id as WizardColorMode)}
          options={[
            { id: 'sw', label: 'Schwarz-Weiß', sub: 'Maximal druckschonend', swatch: ['#0f172a', '#475569', '#94a3b8'] },
            { id: 'print', label: 'Druckfreundlich', sub: 'Graustufen mit Akzent', swatch: ['#1e293b', '#64748b', '#cbd5e1'] },
            { id: 'dezent', label: 'Dezent farbig', sub: 'Indigo-Akzent', swatch: ['#0f172a', '#4f46e5', '#cbd5e1'] },
            { id: 'bunt', label: 'Bunt', sub: 'Mehrere Akzente — für GS', swatch: ['#4f46e5', '#10b981', '#f59e0b'] },
          ]}
        />

        <SectionHeading>
          <span className="mt-5 inline-flex">Deko-Level</span>
        </SectionHeading>
        <div className="flex flex-wrap gap-1.5">
          {(['keine', 'leicht', 'mittel', 'kreativ'] as const).map((l) => (
            <button
              key={l}
              type="button"
              className="chip capitalize"
              aria-pressed={state.decoLevel === l}
              onClick={() => set('decoLevel', l as WizardDecoLevel)}
            >
              {l}
            </button>
          ))}
        </div>

        <SectionHeading>
          <span className="mt-5 inline-flex">Renderer</span>
        </SectionHeading>
        <RadioGroup
          value={state.renderer}
          onChange={(id) => set('renderer', id as WizardRenderer)}
          columns={3}
          options={[
            { id: 'auto', label: 'Auto', sub: 'Empfohlen' },
            { id: 'html', label: 'HTML', sub: 'Web-Vorschau' },
            { id: 'latex', label: 'LaTeX', sub: 'Druckqualität' },
          ]}
        />
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="card bg-[var(--color-bg-app)] p-3.5">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <Eye size={14} className="text-slate-500" aria-hidden />
              <span className="text-[12.5px] font-semibold text-slate-700">Live-Vorschau</span>
              <span className="badge badge-success ml-1">
                <span className="badge-dot" /> Druckbereit
              </span>
            </div>
          </div>
          <div className="grid place-items-center rounded-[10px] border border-slate-200 bg-white p-4 sm:p-6">
            <A4Preview
              orientation={state.orientation}
              margins={state.margins}
              showGuide
              scale={state.orientation === 'portrait' ? 0.46 : 0.36}
              colorMode={state.colorMode}
              designStyle={state.designStyle}
              decoLevel={state.decoLevel}
            />
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[11.5px] text-slate-500">
            <span>{state.orientation === 'portrait' ? '210 × 297 mm' : '297 × 210 mm'} · A4</span>
            <span>Sichtbarer Bereich: gestrichelt</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   Step 4 — Prüfen
   ========================================================= */
const StepPruefen = ({ state, patterns }: { state: WizardState; patterns: Pattern[] }) => {
  const patternName =
    patterns.find((p) => p.id === state.patternId)?.name ??
    (state.patternId === null ? 'Automatisch' : '—');
  const gradeNum = state.grade.trim() === '' ? null : Number(state.grade);
  const derivedAudience = deriveAudienceFromSchoolContext(
    state.schoolForm,
    Number.isFinite(gradeNum as number) ? (gradeNum as number) : null,
  );
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="card p-5 sm:p-6">
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-emerald-200 bg-emerald-50 text-emerald-700">
            <Shield size={18} aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Prüfung &amp; Validierung</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Vorab-Übersicht — endgültige Prüfung erfolgt nach der KI-Generierung.
            </p>
          </div>
        </div>
        <MockBadge
          className="mb-3"
          label="Validierungs-Liste ist Mockup"
          tooltip="Diese Vorab-Checks sind Beispieldaten. Echte Validierungen laufen serverseitig nach der Generierung."
        />
        <ul className="divide-y divide-slate-200">
          <CheckRow ok="ok" label="Lehrer-Prompt vorhanden" detail={state.teacherPrompt ? 'Briefing übergeben.' : 'Optional, aber empfohlen.'} status="OK" />
          <CheckRow ok="ok" label="Aufgabenanzahl & Dauer" detail={`Zielzeit: ca. ${state.duration} Min.`} status="Passend" />
          <CheckRow
            ok="ok"
            label="Vorlage gewählt"
            detail={state.patternId ? `Vorlage: ${patternName}` : 'Automatische Auswahl durch KI.'}
            status="Bereit"
          />
          <CheckRow
            ok="ok"
            label="Druckbereitschaft"
            detail={`A4 · ${state.margins.top}/${state.margins.right}/${state.margins.bottom}/${state.margins.left} mm Ränder`}
            status="OK"
          />
          <CheckRow ok="info" label="Datenschutz" detail="Keine personenbezogenen Daten verarbeitet." status="Geprüft" />
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled
            title="Mockup — die Vorab-Prüfung ist statisch."
            leftIcon={<Sparkles size={14} aria-hidden />}
            rightIcon={
              <MockBadge variant="inline" label="Erneut prüfen" tooltip="Mockup — kein Backend" />
            }
          >
            Erneut prüfen
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Zusammenfassung</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px]">
            <Dt>Titel</Dt>
            <Dd className="font-semibold">{state.topic}</Dd>
            <Dt>Fach / Klasse</Dt>
            <Dd>
              {state.subject} · Klasse {state.grade} · {state.schoolForm}
            </Dd>
            <Dt>Zielgruppe (KI)</Dt>
            <Dd>
              <span className="font-medium">{audienceDisplayLabel(derivedAudience)}</span>
              <span className="mt-0.5 block text-[11.5px] font-normal text-slate-500">
                Aus Schulform &amp; Klassenstufe abgeleitet
              </span>
            </Dd>
            <Dt>Vorlage</Dt>
            <Dd>{patternName}</Dd>
            <Dt>Format</Dt>
            <Dd>
              A4 {state.orientation === 'portrait' ? 'Hochformat' : 'Querformat'} · {state.marginValue} mm
            </Dd>
            <Dt>Designstil</Dt>
            <Dd className="capitalize">{state.designStyle}</Dd>
          </dl>
        </div>
        <div className="card flex gap-3 border border-indigo-100 bg-indigo-50 p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-indigo-700" aria-hidden />
          <div>
            <div className="text-[13px] font-bold text-indigo-800">
              KI-Prüfung ist eine Hilfe, kein Ersatz
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-700">
              Eine fachliche Sichtprüfung vor dem Austeilen wird empfohlen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dt = ({ children }: { children: React.ReactNode }) => (
  <dt className="text-slate-500">{children}</dt>
);
const Dd = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <dd className={cn('m-0 text-slate-900', className)}>{children}</dd>
);

const CheckRow = ({
  ok,
  label,
  detail,
  status,
}: {
  ok: 'ok' | 'warn' | 'info';
  label: string;
  detail: string;
  status: string;
}) => {
  const styles = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    info: 'bg-slate-100 text-slate-500 border-slate-200',
  }[ok];
  const badge = {
    ok: 'badge-success',
    warn: 'badge-warn',
    info: 'badge-neutral',
  }[ok];
  return (
    <li className="flex items-start gap-3 py-3">
      <div className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border', styles)}>
        {ok === 'ok' ? <Check size={13} /> : <Info size={13} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-slate-900">{label}</div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">{detail}</div>
      </div>
      <span className={cn('badge shrink-0', badge)}>{status}</span>
    </li>
  );
};

/* =========================================================
   Step 5 — Export
   ========================================================= */
const StepExport = ({
  state,
  generating,
  progress,
  error,
  onGenerate,
}: {
  state: WizardState;
  generating: boolean;
  progress: number;
  error: string | null;
  onGenerate: () => void;
}) => (
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <div>
      <div className="mb-5 flex items-center gap-3 rounded-[14px] border border-emerald-200 bg-emerald-50 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
          <Sparkles size={20} aria-hidden />
        </div>
        <div>
          <div className="text-[15px] font-bold text-emerald-700">Bereit zur Generierung</div>
          <div className="mt-0.5 text-[13px] text-slate-700">
            „{state.topic}“ · {state.subject} · Klasse {state.grade}
          </div>
        </div>
      </div>

      <h2 className="mb-1 text-lg font-bold text-slate-900">Generieren &amp; exportieren</h2>
      <p className="mb-4 text-[13.5px] leading-relaxed text-slate-500">
        Klicke unten, um das Arbeitsblatt durch die KI erstellen zu lassen. Du landest danach im
        Editor und kannst PDF/Druck/LaTeX direkt aufrufen.
      </p>

      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className="relative w-full overflow-hidden rounded-xl border border-indigo-600/30 bg-indigo-100 px-4 py-3.5 text-left font-bold shadow-sm transition-shadow hover:shadow disabled:cursor-not-allowed"
        aria-busy={generating}
      >
        <span
          className="pointer-events-none absolute inset-y-0 left-0 bg-indigo-600 transition-[width] duration-100 ease-linear"
          style={{ width: `${generating ? progress : 100}%` }}
          aria-hidden
        />
        <span
          className={cn(
            'relative z-10 flex min-h-[2.75rem] flex-wrap items-center justify-center gap-x-1 px-1 text-center transition-colors duration-150',
            !generating || progress > 88
              ? 'text-white [text-shadow:0_1px_2px_rgb(0_0_0/40%)]'
              : 'text-indigo-950',
            generating ? 'text-sm leading-snug sm:text-[0.95rem]' : 'text-base',
          )}
        >
          {generating ? (
            <span className="inline-flex flex-wrap items-center justify-center gap-x-0.5">
              <span>KI generiert das Arbeitsblatt</span>
              <span className="loading-dots" aria-hidden>
                <span className="loading-dots__dot" />
                <span className="loading-dots__dot" />
                <span className="loading-dots__dot" />
              </span>
            </span>
          ) : (
            'Arbeitsblatt mit KI generieren'
          )}
        </span>
      </button>
      {error && (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      )}

      <div className="divider my-5" />

      <h3 className="mb-3 text-sm font-bold text-slate-900">Nach dem Generieren möglich</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ExportCard icon={Download} title="PDF" desc="Druckfertig · A4 · inkl. Lösungsblatt" />
        <ExportCard icon={Printer} title="Drucken" desc="Browser-Druckdialog mit korrekten Rändern" />
        <ExportCard
          icon={LayoutGrid}
          title="Als Vorlage erstellen"
          desc="Nur Mockup — kein Backend"
          mock
        />
        <ExportCard
          icon={Share2}
          title="Mit Kollegen teilen"
          desc="Nur Mockup — kein Backend"
          mock
        />
      </div>
    </div>

    <div className="card bg-[var(--color-bg-app)] p-5">
      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-700">
        <Eye size={14} aria-hidden /> Endvorschau (Konfiguration)
      </div>
      <div className="grid place-items-center p-3">
        <A4Preview
          orientation={state.orientation}
          margins={state.margins}
          showGuide={false}
          scale={0.55}
          colorMode={state.colorMode}
          designStyle={state.designStyle}
          decoLevel={state.decoLevel}
        />
      </div>
    </div>
  </div>
);

const ExportCard = ({
  icon: Icon,
  title,
  desc,
  mock,
}: {
  icon: typeof Download;
  title: string;
  desc: string;
  mock?: boolean;
}) => (
  <div
    className={cn(
      'card flex flex-col gap-3 p-4',
      mock && 'mock-overlay border-amber-200 bg-amber-50/30',
    )}
  >
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-slate-100 text-slate-700">
        <Icon size={18} aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold text-slate-900">{title}</div>
        <div className="text-[12px] leading-snug text-slate-500">{desc}</div>
      </div>
      {mock && <MockBadge variant="inline" tooltip="Mockup — folgt im Backend" />}
    </div>
    <Button
      variant="secondary"
      fullWidth
      disabled={mock}
      title={mock ? 'Mockup — noch nicht funktional' : undefined}
      className={cn(mock && 'opacity-60')}
      leftIcon={mock ? <RotateCcw size={14} aria-hidden /> : <Icon size={14} aria-hidden />}
    >
      {mock ? 'Coming soon' : 'Im Editor verfügbar'}
    </Button>
  </div>
);

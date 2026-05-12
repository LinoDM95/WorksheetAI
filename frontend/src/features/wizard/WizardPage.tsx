import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  FileText,
  Palette,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { api } from '../../lib/api';
import { WORKSHEET_LIST_QUERY_KEY, WORKSHEET_LIST_STALE_MS } from '../../lib/listQueries';
import type { Worksheet } from '../../types';
import { A4Preview } from '../../components/A4Preview';
import { MockBadge } from '../../components/MockBadge';
import { Alert, Button, Field, TextInput } from '../../components/ui';
import { cn } from '../../lib/cn';
import {
  buildGeneratePayload,
  validateWizardInhaltStep,
  type WizardOrientation,
  type WizardRenderer,
  type WizardState,
  type WorksheetWizardMode,
} from './wizardState';
import { LIBRARY_GRADE_STEPS, LIBRARY_SUBJECT_FILTER_LABELS } from '../boards/lib/libraryCatalogFilters';
import { useWizardState, type WizardActions } from './useWizardState';
import { FieldRow, RadioGroup, SectionHeading, Stepper } from './components';
import { useShellChrome } from '../../components/shell/ShellChromeContext';
import { useAiGenerationJobs } from '../../components/ai-generation/AiGenerationJobsContext';
import { AI_GENERATION_QUEUE_FULL_MESSAGE } from '../../components/ai-generation/aiGenerationTypes';
import { isUserCancelledGenerationError } from '../../components/ai-generation/generationQueue';
import { addPendingFirstOpenWorksheet } from '../worksheets/lib/worksheetFirstOpenHighlight';

const STEP_LABELS = ['Modus', 'Inhalt', 'Design & Seite', 'Generieren'];
const STEP_NEXT_LABELS = [
  'Weiter zum Inhalt',
  'Weiter zum Design',
  'Weiter zum Generieren',
] as const;

const selectClassName = cn(
  'select h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-0 text-sm text-slate-900',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30',
);

/** Demo-Anmutung nur für die Wizard-Vorschau — ohne separate UI-Steuerung. */
const WIZARD_A4_PREVIEW_STYLE = {
  colorMode: 'dezent',
  designStyle: 'modern',
  decoLevel: 'leicht',
} as const;

const formatWizardGradeSummary = (state: WizardState): string => {
  const a = state.gradeFrom.trim();
  const b = state.gradeTo.trim();
  if (!a && !b) return '—';
  if (a && b && a === b) return `Klasse ${a}`;
  if (a && b) return `Klassen ${a}–${b}`;
  return `Klasse ${a || b}`;
};

export function WizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { breadcrumbBackHref, breadcrumbBackLabel } = useShellChrome();
  const { state, actions } = useWizardState();
  const subjectFromUrlApplied = useRef(false);

  useEffect(() => {
    if (subjectFromUrlApplied.current) return;
    const raw = searchParams.get('subject')?.trim();
    if (!raw) return;
    subjectFromUrlApplied.current = true;
    actions.patch({ subject: raw.slice(0, 120) });
  }, [searchParams, actions]);
  const { startJob, updateJob, completeJob, failJob, runSerialized, jobs } = useAiGenerationJobs();
  const wizardWsJobIdsRef = useRef(new Set<string>());
  const [step, setStep] = useState(0);
  const [inhaltStepError, setInhaltStepError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateProgress, setGenerateProgress] = useState(0);
  const progressStop = useRef(false);

  const runningWsCreateJobId = jobs.find(
    (j) =>
      wizardWsJobIdsRef.current.has(j.id) &&
      j.kind === 'worksheet-create' &&
      j.status === 'running',
  )?.id;

  const wizardWsQueuedOnly = jobs.some(
    (j) =>
      wizardWsJobIdsRef.current.has(j.id) &&
      j.kind === 'worksheet-create' &&
      j.status === 'queued',
  );

  const wizardWsBusy = Boolean(
    jobs.some(
      (j) =>
        wizardWsJobIdsRef.current.has(j.id) &&
        j.kind === 'worksheet-create' &&
        (j.status === 'queued' || j.status === 'running'),
    ),
  );

  useEffect(() => {
    if (!runningWsCreateJobId) return;
    progressStop.current = false;
    setGenerateProgress(0);
    const jid = runningWsCreateJobId;
    updateJob(jid, { progressPercent: 0, phaseLabel: 'KI erstellt dein Arbeitsblatt …' });
    const id = window.setInterval(() => {
      if (progressStop.current) return;
      setGenerateProgress((p) => {
        const next = p >= 92 ? p : Math.min(92, p + (92 - p) * 0.035 + 0.35);
        updateJob(jid, { progressPercent: next });
        return next;
      });
    }, 60);
    return () => window.clearInterval(id);
  }, [runningWsCreateJobId, updateJob]);

  const handleGenerate = async () => {
    setGenerateError(null);
    const inhaltErr = validateWizardInhaltStep(state);
    if (inhaltErr) {
      setInhaltStepError(inhaltErr);
      setStep(1);
      setGenerateError(inhaltErr);
      return;
    }
    const subtitle =
      (state.topic && state.topic.trim()) ||
      (state.subject && state.subject.trim()) ||
      undefined;
    const jid = startJob({
      kind: 'worksheet-create',
      title: 'Arbeitsblatt wird erstellt',
      subtitle,
    });
    if (!jid) {
      setGenerateError(AI_GENERATION_QUEUE_FULL_MESSAGE);
      return;
    }
    wizardWsJobIdsRef.current.add(jid);
    try {
      await runSerialized(jid, async (signal) => {
        updateJob(jid, { phaseLabel: 'KI erstellt dein Arbeitsblatt …', progressPercent: 4 });
        const payload = buildGeneratePayload(state);
        const r = await api.post('/worksheets/generate/', payload, { signal });
        progressStop.current = true;
        setGenerateProgress(100);
        updateJob(jid, { progressPercent: 100 });
        await new Promise((res) => window.setTimeout(res, 200));
        const ws = r.data as Worksheet;
        void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
        addPendingFirstOpenWorksheet(ws.id);
        completeJob(jid, {
          successMessage: 'Arbeitsblatt ist bereit.',
          primaryAction: { label: 'Arbeitsblatt öffnen', to: `/app/worksheets/${ws.id}` },
        });
        navigate('/app/worksheets');
      });
    } catch (err) {
      if (isUserCancelledGenerationError(err)) {
        progressStop.current = true;
        setGenerateProgress(0);
        return;
      }
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
      failJob(jid, msg);
      setGenerateError(msg);
      setGenerateProgress(0);
    } finally {
      wizardWsJobIdsRef.current.delete(jid);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      const msg = validateWizardInhaltStep(state);
      if (msg) {
        setInhaltStepError(msg);
        return;
      }
      setInhaltStepError(null);
    }
    if (step < 3) setStep((s) => s + 1);
  };

  useEffect(() => {
    if (step !== 1) setInhaltStepError(null);
  }, [step]);

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
          {step === 0 && <StepModus state={state} actions={actions} />}
          {step === 1 && <StepInhalt state={state} actions={actions} error={inhaltStepError} />}
          {step === 2 && <StepDesign state={state} actions={actions} />}
          {step === 3 && (
            <StepGenerieren
              state={state}
              generating={wizardWsBusy}
              queuedOnly={wizardWsQueuedOnly && !runningWsCreateJobId}
              progress={generateProgress}
              error={generateError}
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
        {step < 3 ? (
          <Button onClick={handleNext} rightIcon={<ArrowRight size={15} aria-hidden />}>
            {STEP_NEXT_LABELS[step]}
          </Button>
        ) : (
          <Button
            variant="success"
            onClick={() => void handleGenerate()}
            disabled={wizardWsBusy}
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
   Step 0 — Modus
   ========================================================= */
const StepModus = ({
  state,
  actions,
}: {
  state: WizardState;
  actions: WizardActions;
}) => {
  const pick = (mode: WorksheetWizardMode) => {
    actions.setField('worksheetMode', mode);
    if (mode === 'creative') {
      actions.setField('renderer', 'html');
    }
  };
  return (
    <div className="card p-5 sm:p-6">
      <h2 className="mb-1 text-lg font-bold text-slate-900">Modus wählen</h2>
      <p className="mb-5 text-[13.5px] leading-relaxed text-slate-500">
        <strong className="font-semibold text-slate-700">Standard</strong> nutzt die bewährte Pipeline mit
        Vorlagen-Matching und LaTeX/KaTeX-Referenz.{' '}
        <strong className="font-semibold text-slate-700">Kreativ</strong> erzeugt stärker gestaltete HTML/CSS-Blätter
        ohne feste Vorlage — ideal, wenn du mehr visuelle Freiheit willst.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => pick('standard')}
          className={cn(
            'flex flex-col gap-2 rounded-[14px] border-2 px-4 py-4 text-left transition-all',
            state.worksheetMode === 'standard'
              ? 'border-indigo-500 bg-indigo-50 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]'
              : 'border-slate-200 bg-white hover:border-indigo-200',
          )}
        >
          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
            <BookOpen size={18} className="text-indigo-600" aria-hidden />
            Standard
          </span>
          <span className="text-[12.5px] leading-relaxed text-slate-600">
            Klassische Arbeitsblatt-Pipeline — inkl. Vorlagen-Vorschlag und fokussiert sachliche Aufmachung.
          </span>
          {state.worksheetMode === 'standard' && (
            <span className="text-[11px] font-semibold text-indigo-700">Ausgewählt</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => pick('creative')}
          className={cn(
            'flex flex-col gap-2 rounded-[14px] border-2 px-4 py-4 text-left transition-all',
            state.worksheetMode === 'creative'
              ? 'border-indigo-500 bg-indigo-50 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]'
              : 'border-slate-200 bg-white hover:border-indigo-200',
          )}
        >
          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
            <Palette size={18} className="text-indigo-600" aria-hidden />
            Kreativ
          </span>
          <span className="text-[12.5px] leading-relaxed text-slate-600">
            Eigenständiger HTML/CSS-Pfad: freiere Gestaltung, kein Vorlagen-Matching, Ausgabe bleibt strukturiertes
            JSON der App.
          </span>
          {state.worksheetMode === 'creative' && (
            <span className="text-[11px] font-semibold text-indigo-700">Ausgewählt</span>
          )}
        </button>
      </div>
    </div>
  );
};

/* =========================================================
   Step 1 — Inhalt
   ========================================================= */
const StepInhalt = ({
  state,
  actions,
  error,
}: {
  state: WizardState;
  actions: WizardActions;
  error?: string | null;
}) => {
  const set = actions.setField;
  const subjectTrim = state.subject.trim();
  const subjectExtra =
    subjectTrim && !LIBRARY_SUBJECT_FILTER_LABELS.includes(subjectTrim) ? subjectTrim : null;

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="mb-1 text-lg font-bold text-slate-900">Inhalt</h2>
      <p className="mb-5 text-[13.5px] leading-relaxed text-slate-500">
        Pflichtfelder sind mit einem Stern markiert. Alles unter „Aufgabenart“ ist optional und verfeinert die KI — ohne
        Auswahl gelten sinnvolle Standardwerte.
      </p>

      {error ? (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fach" htmlFor="w-subject" required>
            <select
              id="w-subject"
              className={selectClassName}
              value={subjectExtra ? subjectTrim : state.subject}
              onChange={(e) => set('subject', e.target.value)}
              aria-required
            >
              <option value="">Bitte wählen …</option>
              {subjectExtra ? (
                <option value={subjectExtra}>
                  {subjectExtra} (nicht in Filterliste)
                </option>
              ) : null}
              {LIBRARY_SUBJECT_FILTER_LABELS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Klassenstufe" required htmlFor="w-grade-from">
            <div className="grid grid-cols-2 gap-3">
              <select
                id="w-grade-from"
                className={selectClassName}
                value={state.gradeFrom}
                onChange={(e) => set('gradeFrom', e.target.value)}
                aria-label="Klassenstufe von"
                aria-required
              >
                <option value="">Von …</option>
                {LIBRARY_GRADE_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                id="w-grade-to"
                className={selectClassName}
                value={state.gradeTo}
                onChange={(e) => set('gradeTo', e.target.value)}
                aria-label="Klassenstufe bis"
                aria-required
              >
                <option value="">Bis …</option>
                {LIBRARY_GRADE_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>

        <Field label="Thema" htmlFor="w-topic" required>
          <TextInput
            id="w-topic"
            value={state.topic}
            onChange={(e) => set('topic', e.target.value)}
            placeholder="z. B. Photosynthese, Französische Revolution …"
            aria-required
          />
        </Field>

        <Field label="Aufgabenart (optional)">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['practice', 'Üben / Festigen'],
                ['introduction', 'Einstieg'],
                ['homework', 'Hausaufgabe'],
                ['quiz', 'Kurztest'],
                ['exam_prep', 'Prüfungsvorbereitung'],
                ['station_work', 'Stationen'],
                ['reflection', 'Reflexion'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="chip"
                aria-pressed={state.worksheetType === id}
                onClick={() =>
                  set('worksheetType', state.worksheetType === id ? '' : id)
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Schwierigkeit (optional)" htmlFor="w-difficulty">
            <select
              id="w-difficulty"
              className={selectClassName}
              value={state.difficulty}
              onChange={(e) => set('difficulty', e.target.value)}
            >
              <option value="">Bitte wählen …</option>
              <option value="basic">Grundlegend</option>
              <option value="standard">Standard</option>
              <option value="advanced">Anspruchsvoll</option>
              <option value="expert">Experte</option>
            </select>
          </Field>
          <Field label="Dauer (optional)" htmlFor="w-duration">
            <select
              id="w-duration"
              className={selectClassName}
              value={state.duration}
              onChange={(e) => set('duration', e.target.value)}
            >
              <option value="">Bitte wählen …</option>
              {['15', '30', '45', '60', '90'].map((d) => (
                <option key={d} value={d}>
                  {d} Min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sprache (optional)" htmlFor="w-lang">
            <select
              id="w-lang"
              className={selectClassName}
              value={state.language}
              onChange={(e) => set('language', e.target.value)}
            >
              <option value="">Bitte wählen …</option>
              <option value="de">Deutsch</option>
              <option value="de_simple">Deutsch (einfach)</option>
              <option value="en">Englisch</option>
              <option value="fr">Französisch</option>
            </select>
          </Field>
        </div>

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600">
          Die sprachliche Zielgruppe für die KI leitet die App aus der gewählten{' '}
          <strong className="font-semibold text-slate-700">Klassenstufe</strong> ab.
        </p>

        <div className="divider my-1" />

        <Field
          label="Lehrer-Prompt / Zusatzwünsche"
          htmlFor="w-prompt"
          required
          help="Didaktischer Schwerpunkt, typische Missverständnisse, Tabus — hat inhaltlich Vorrang vor Layout-Vorgaben."
        >
          <textarea
            id="w-prompt"
            rows={5}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            value={state.teacherPrompt}
            onChange={(e) => set('teacherPrompt', e.target.value)}
            placeholder="z. B. Fokus auf …, vermeide …, Lösungen ausführlich"
            aria-required
          />
        </Field>

        <div className="pt-1">
          <MockBadge
            variant="inline"
            label="KI-Aufgaben-Generierung"
            tooltip="Die KI-Generierung startet im letzten Schritt. Eine Zwischenvorschau der Aufgaben ist hier kein Live-Rendering."
          />
        </div>
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
          Seitenformat und Ränder. Die Vorschau rechts zeigt nur den Druckbereich (Platzhalter). Wenn du Farben,
          Deko oder einen bestimmten Gestaltungsstil möchtest, formuliere das im Schritt „Inhalt“ im Lehrer-Prompt — die KI
          setzt es im Arbeitsblatt um.
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

        {state.worksheetMode === 'standard' ? (
          <>
            <SectionHeading>Renderer</SectionHeading>
            <p className="mb-3 text-[12.5px] leading-relaxed text-slate-600">
              Ziel-Pipeline für spätere Bearbeitung und Druckweg.{' '}
              <strong className="font-medium">Kreativ</strong>-Arbeitsblätter sind immer{' '}
              <strong className="font-medium">HTML</strong> (ohne eigene Auswahl).
            </p>
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
          </>
        ) : null}
        {state.worksheetMode === 'creative' ? (
          <>
            <div className="divider my-5" />
            <SectionHeading>Vorgegebener Kopfbereich</SectionHeading>
            <p className="mb-3 text-[12.5px] leading-relaxed text-slate-600">
              Standard zeigt über dem gestalteten Inhalt weiterhin einen <strong className="font-medium">festen Kopf</strong> mit
              Titel und Unterzeile (Fach/Stufe). Wenn du die volle A4‑Fläche nur für das KI‑Layout möchtest, schalte den Kopf hier
              ab — dann sollte die KI Titelführung im HTML auf Seite 1 einplanen.
            </p>
            <RadioGroup
              value={state.creativeShowSheetHeader ? 'with' : 'without'}
              onChange={(id) => set('creativeShowSheetHeader', id === 'with')}
              options={[
                { id: 'with', label: 'Mit Kopf', sub: 'Titel/Unterzeile wie gewohnt' },
                { id: 'without', label: 'Ohne Kopf', sub: 'Nur gestaltetes HTML‑Feld (voller Bereich)' },
              ]}
            />
          </>
        ) : null}
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
              {...WIZARD_A4_PREVIEW_STYLE}
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
   Step 4 — Generieren
   ========================================================= */
const StepGenerieren = ({
  state,
  generating,
  queuedOnly,
  progress,
  error,
}: {
  state: WizardState;
  generating: boolean;
  queuedOnly?: boolean;
  progress: number;
  error: string | null;
}) => (
  <div className="card p-5 sm:p-6">
    <div className="mb-4 flex items-start gap-3 rounded-[14px] border border-emerald-200 bg-emerald-50 p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
        <Sparkles size={20} aria-hidden />
      </div>
      <div>
        <div className="text-[15px] font-bold text-emerald-800">Bereit zur Generierung</div>
        <div className="mt-1 text-[13px] text-slate-700">
          „{state.topic}“ · {state.subject} · {formatWizardGradeSummary(state)} ·{' '}
          {state.worksheetMode === 'creative' ? (
            <>
              Modus: Kreativ (HTML/CSS)
              {state.creativeShowSheetHeader ? ' · App-Kopf: an' : ' · App-Kopf: aus'}
            </>
          ) : (
            'Modus: Standard'
          )}
        </div>
      </div>
    </div>
    <p className="text-[13.5px] leading-relaxed text-slate-600">
      Starte die KI mit <strong className="font-medium">Fertigstellen &amp; Generieren</strong> unten. Danach wechselt die
      Ansicht zur Arbeitsblatt-Galerie: Das neue Blatt erscheint unter „Ohne Ordner“ und ist grün hervorgehoben, bis du es
      einmal öffnest. Über die Benachrichtigung oder die Liste gelangst du zum Editor; PDF und Druck erreichst du dort.
    </p>
    {generating ? (
      <div className="mt-5">
        <div className="mb-1 flex justify-between text-[12px] text-slate-600">
          <span>{queuedOnly ? 'In der KI-Warteschlange …' : 'Generierung läuft …'}</span>
          {!queuedOnly ? <span className="tabular-nums">{Math.round(progress)} %</span> : null}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-indigo-600 transition-[width] duration-100 ease-linear"
            style={{ width: `${queuedOnly ? 8 : progress}%` }}
          />
        </div>
      </div>
    ) : null}
    {error ? (
      <Alert tone="error" className="mt-4">
        {error}
      </Alert>
    ) : null}
    <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-700">
        <Eye size={14} aria-hidden /> Vorschau der Seitenparameter (ohne Aufgabentext)
      </div>
      <div className="grid place-items-center">
        <A4Preview
          orientation={state.orientation}
          margins={state.margins}
          showGuide={false}
          scale={state.orientation === 'portrait' ? 0.44 : 0.36}
          {...WIZARD_A4_PREVIEW_STYLE}
        />
      </div>
    </div>
  </div>
);

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Alert, Badge, Button, Card, Field, PageHeader } from '../../components/ui';
import { DOCUMENT_TYPE_OPTIONS, FEDERAL_STATE_OPTIONS, findStateOption } from './states';
import {
  approveAutoRun,
  autoDiscoverSource,
  autoExtractSource,
  fetchAutoRun,
  fetchCurriculumSource,
  type AutoApproveResult,
  type AutoExtractRunResult,
  type AutoRunDetail,
  type CurriculumExtractionJob,
  type CurriculumSource,
  type DiscoveryPlanEntry,
} from './curriculaApi';

const STEPS = ['Hochladen', 'Plan prüfen', 'Review & Bestätigen'] as const;

const StepIndicator = ({ current }: { current: number }) => (
  <ol className="flex items-center gap-3 text-sm">
    {STEPS.map((label, idx) => {
      const active = idx === current;
      const done = idx < current;
      return (
        <li key={label} className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-bold',
              done && 'border-emerald-200 bg-emerald-50 text-emerald-700',
              active && !done && 'border-violet-300 bg-violet-50 text-violet-700',
              !active && !done && 'border-slate-200 bg-white text-slate-400',
            )}
            aria-current={active ? 'step' : undefined}
          >
            {done ? <Check size={14} aria-hidden /> : idx + 1}
          </span>
          <span
            className={cn(
              'font-medium',
              active ? 'text-slate-900' : 'text-slate-500',
            )}
          >
            {label}
          </span>
          {idx < STEPS.length - 1 ? (
            <ChevronRight size={14} className="text-slate-300" aria-hidden />
          ) : null}
        </li>
      );
    })}
  </ol>
);

type Step = 0 | 1 | 2;

type ExtractionProgress = {
  total: number;
  done: number;
};

const formatExtractedContext = (job: CurriculumExtractionJob) => {
  const ctx = (job.extracted_context || {}) as Record<string, unknown>;
  const subtopics = Array.isArray(ctx.subtopics) ? (ctx.subtopics as string[]) : [];
  const competencies = Array.isArray(ctx.competency_goals) ? (ctx.competency_goals as string[]) : [];
  const tasks = Array.isArray(ctx.allowed_task_types) ? (ctx.allowed_task_types as string[]) : [];
  const rules = Array.isArray(ctx.validation_rules) ? (ctx.validation_rules as string[]) : [];
  const summary = typeof ctx.public_summary === 'string' ? (ctx.public_summary as string) : '';
  return { subtopics, competencies, tasks, rules, summary };
};

export function AutoCurriculumWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [stateSlug, setStateSlug] = useState<string>('berlin_brandenburg');
  const [docType, setDocType] = useState<string>('rlp_kompakt');
  const [file, setFile] = useState<File | null>(null);

  const [source, setSource] = useState<CurriculumSource | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<ExtractionProgress | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<AutoRunDetail | null>(null);
  const [skipIndices, setSkipIndices] = useState<Set<number>>(new Set());
  const [approveResult, setApproveResult] = useState<AutoApproveResult | null>(null);
  const [discoveryTocGapSubjects, setDiscoveryTocGapSubjects] = useState<string[]>([]);

  const pollRef = useRef<number | null>(null);

  const stateOption = useMemo(() => findStateOption(stateSlug), [stateSlug]);
  const replicateLabel = useMemo(
    () => (stateOption?.replicate.length ? stateOption.replicate.join(' & ') : ''),
    [stateOption],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const handleFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Bitte eine PDF-Datei auswählen.');
      return;
    }
    setError('');
    setFile(f);
  };

  const goStartUpload = async () => {
    if (!file) {
      setError('Bitte zuerst eine PDF-Datei auswählen.');
      return;
    }
    if (!stateOption) {
      setError('Bitte ein Bundesland auswählen.');
      return;
    }
    setBusy(true);
    setError('');
    setDiscoveryTocGapSubjects([]);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('state_slug', stateOption.slug);
      fd.append('document_type', docType);
      if (stateOption.replicate.length > 0) {
        for (const r of stateOption.replicate) {
          fd.append('replicate_states', r);
        }
      }
      const created = await api.post<CurriculumSource>('/curricula/sources/', fd).then((r) => r.data);
      setSource(created);
      await api.post(`/curricula/sources/${created.id}/extract-text/`);
      const refreshed = await fetchCurriculumSource(created.id);
      setSource(refreshed);
      const discovered = await autoDiscoverSource(created.id);
      setSource(discovered);
      const dr = discovered.discovery_result;
      const missing =
        dr && Array.isArray(dr.missing_after_rounds)
          ? dr.missing_after_rounds.filter((x): x is string => typeof x === 'string')
          : [];
      setDiscoveryTocGapSubjects(missing);
      const plan = discovered.discovery_plan ?? [];
      setSelectedIndices(new Set(plan.map((_, i) => i)));
      if (discovered.discovery_status === 'failed') {
        setError(discovered.discovery_error || 'Auto-Discovery ist fehlgeschlagen.');
        return;
      }
      if (plan.length === 0) {
        setError('Es konnten keine Fächer im Dokument erkannt werden. Bitte eine andere PDF probieren.');
        return;
      }
      setStep(1);
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e) ? e : null;
      const detail = ax?.response?.data;
      const msg =
        typeof detail === 'string'
          ? detail
          : detail && typeof detail === 'object'
            ? JSON.stringify(detail)
            : 'Upload oder Discovery fehlgeschlagen.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const toggleAllSelected = () => {
    setSelectedIndices((prev) => {
      const total = source?.discovery_plan?.length ?? 0;
      if (prev.size === total) return new Set();
      return new Set(Array.from({ length: total }, (_, i) => i));
    });
  };

  const startExtraction = async () => {
    if (!source) return;
    const indices = Array.from(selectedIndices).sort((a, b) => a - b);
    if (indices.length === 0) {
      setError('Bitte mindestens einen Plan-Eintrag auswählen.');
      return;
    }
    setError('');
    setExtracting(true);
    setExtractProgress({ total: indices.length, done: 0 });
    try {
      const result: { source: CurriculumSource; run: AutoExtractRunResult } = await autoExtractSource(
        source.id,
        indices,
      );
      setRunId(result.run.run_id);
      setSource(result.source);
      const detail = await fetchAutoRun(source.id, result.run.run_id);
      setRunDetail(detail);
      setExtractProgress({ total: detail.summary.total, done: detail.summary.completed + detail.summary.failed });
      setStep(2);
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e) ? e : null;
      setError(ax?.response?.data?.detail || 'Auto-Extraktion fehlgeschlagen.');
    } finally {
      setExtracting(false);
    }
  };

  useEffect(() => {
    if (step !== 2 || !source || !runId || !runDetail) return;
    if (runDetail.summary.running === 0) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const next = await fetchAutoRun(source.id, runId);
        setRunDetail(next);
        if (next.summary.running === 0) {
          stopPolling();
        }
      } catch {
        /* ignore polling errors */
      }
    }, 2500);
    return stopPolling;
  }, [step, source, runId, runDetail, stopPolling]);

  const toggleSkip = (planIndex: number) => {
    setSkipIndices((prev) => {
      const next = new Set(prev);
      if (next.has(planIndex)) {
        next.delete(planIndex);
      } else {
        next.add(planIndex);
      }
      return next;
    });
  };

  const completedJobs = useMemo(
    () => (runDetail?.jobs ?? []).filter((j) => j.status === 'completed'),
    [runDetail],
  );

  const failedJobs = useMemo(
    () => (runDetail?.jobs ?? []).filter((j) => j.status === 'failed'),
    [runDetail],
  );

  const groupedBySubject = useMemo(() => {
    const out: Record<string, CurriculumExtractionJob[]> = {};
    for (const j of completedJobs) {
      const key = (j.extracted_context as { subject?: string } | undefined)?.subject || j.subject || 'Sonstige';
      out[key] = out[key] || [];
      out[key].push(j);
    }
    return out;
  }, [completedJobs]);

  const finalApprove = async () => {
    if (!source || !runId) return;
    setBusy(true);
    setError('');
    try {
      const skip_indices = Array.from(skipIndices);
      const result = await approveAutoRun(source.id, runId, {
        activate: true,
        skip_indices,
        replicate_states: source.replicate_states ?? [],
      });
      setApproveResult(result);
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e) ? e : null;
      setError(ax?.response?.data?.detail || 'Aktivieren fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const renderStep0 = () => (
    <Card className="!p-6">
      <h2 className="text-base font-semibold text-slate-900">PDF auswählen</h2>
      <p className="mt-1 text-xs text-slate-500">
        Lade einen kompletten Rahmenlehrplan hoch (PDF). Das System erkennt selbst Fächer, Themenfelder und
        Klassenbänder. Du musst keinen Titel angeben — er wird aus Bundesland und Dokumenttyp generiert.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Bundesland" htmlFor="cs-state">
          <select
            id="cs-state"
            className="input"
            value={stateSlug}
            onChange={(e) => setStateSlug(e.target.value)}
          >
            {FEDERAL_STATE_OPTIONS.map((opt) => (
              <option key={opt.slug} value={opt.slug}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dokumenttyp" htmlFor="cs-doc">
          <select
            id="cs-doc"
            className="input"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {replicateLabel ? (
        <Alert tone="info" className="mt-4">
          „{replicateLabel}" teilen sich diesen RLP. Wir extrahieren einmal und legen am Ende je ein Set
          Curriculum-Kontexte pro Bundesland an.
        </Alert>
      ) : null}

      <label
        className={cn(
          'mt-4 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-violet-300 hover:bg-violet-50/40',
          file && 'border-emerald-300 bg-emerald-50',
        )}
      >
        <Upload size={28} className="text-slate-400" aria-hidden />
        <div className="text-sm font-medium text-slate-700">
          {file ? file.name : 'PDF hier hineinziehen oder klicken'}
        </div>
        <div className="text-[11px] text-slate-500">Maximalgröße laut Server-Konfiguration. Nur PDF.</div>
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-red-600"
            onClick={(e) => {
              e.preventDefault();
              setFile(null);
            }}
          >
            <X size={12} aria-hidden /> Datei entfernen
          </button>
        ) : null}
      </label>

      {error ? (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          leftIcon={<ArrowLeft size={14} aria-hidden />}
          onClick={() => navigate('/app/curricula/sources')}
        >
          Abbrechen
        </Button>
        <Button
          loading={busy}
          disabled={busy || !file}
          leftIcon={<Sparkles size={14} aria-hidden />}
          onClick={() => void goStartUpload()}
        >
          Hochladen & analysieren
        </Button>
      </div>
    </Card>
  );

  const renderStep1 = () => {
    const plan: DiscoveryPlanEntry[] = source?.discovery_plan ?? [];
    const total = plan.length;
    const allSelected = total > 0 && selectedIndices.size === total;
    return (
      <div className="space-y-4">
        <Card className="!p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Erkannte Fächer und Themenfelder ({total})
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Wähle die Einträge, die ins System übernommen werden sollen. Default: alle.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={toggleAllSelected}>
              {allSelected ? 'Auswahl leeren' : 'Alle auswählen'}
            </Button>
          </div>

          {discoveryTocGapSubjects.length > 0 ? (
            <Alert tone="warn" className="mt-3">
              Laut KI-Inhaltsverzeichnis konnten nach mehreren Nachzieh-Runden noch keine klaren Plan-Einträge
              gebildet werden für: {discoveryTocGapSubjects.join(', ')}. Du kannst mit dem vorliegenden Plan
              fortfahren oder die PDF erneut prüfen (lesbarer Text, vollständiges Inhaltsverzeichnis).
            </Alert>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2">Fach</th>
                  <th className="px-3 py-2">Klassenband</th>
                  <th className="px-3 py-2">Themenfeld</th>
                  <th className="px-3 py-2">Seiten</th>
                  <th className="px-3 py-2">Konfidenz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.map((entry, idx) => (
                  <tr key={`${entry.subject}-${idx}`}>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIndices.has(idx)}
                        onChange={() => toggleSelected(idx)}
                        className="h-4 w-4 cursor-pointer accent-violet-600"
                      />
                    </td>
                    <td className="px-3 py-2 align-top font-medium text-slate-900">{entry.subject}</td>
                    <td className="px-3 py-2 align-top text-slate-700">{entry.grade_band}</td>
                    <td className="px-3 py-2 align-top text-slate-700">{entry.topic_area}</td>
                    <td className="px-3 py-2 align-top text-slate-700">
                      {entry.page_start}–{entry.page_end}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-500">
                      {Math.round((entry.confidence ?? 0) * 100)} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            leftIcon={<ArrowLeft size={14} aria-hidden />}
            onClick={() => setStep(0)}
          >
            Zurück
          </Button>
          <Button
            loading={extracting}
            disabled={extracting || selectedIndices.size === 0}
            leftIcon={<Sparkles size={14} aria-hidden />}
            onClick={() => void startExtraction()}
          >
            Voll-Extraktion starten
          </Button>
        </div>
      </div>
    );
  };

  const renderStep2 = () => {
    if (approveResult) {
      const factor = approveResult.replicate_states.length || 1;
      const created = approveResult.created.length;
      return (
        <Card className="!p-6 text-center">
          <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-500" aria-hidden />
          <h2 className="text-lg font-semibold text-slate-900">
            {created} Curriculum-Kontexte gespeichert
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {factor > 1 ? (
              <>Aktiviert für {approveResult.replicate_states.join(', ')} (×{factor}).</>
            ) : (
              <>Aktiviert. Sie sind sofort für die Arbeitsblatt-Erstellung verfügbar.</>
            )}
          </p>
          {approveResult.skipped.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              {approveResult.skipped.length} Eintrag/Einträge übersprungen.
            </p>
          ) : null}
          {approveResult.errors.length > 0 ? (
            <Alert tone="warn" className="mt-4 text-left">
              <div className="font-semibold">Hinweise</div>
              <ul className="mt-1 list-inside list-disc">
                {approveResult.errors.map((e) => (
                  <li key={e.plan_index}>
                    Eintrag #{e.plan_index}: {e.error}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <div className="mt-5 flex justify-center gap-2">
            <Button as="link" variant="secondary" to="/app/curricula/contexts">
              Zur Kontextliste
            </Button>
            <Button as="link" to="/app/curricula/sources">
              Fertig
            </Button>
          </div>
        </Card>
      );
    }

    const summary = runDetail?.summary;
    const stillRunning = (summary?.running ?? 0) > 0;
    return (
      <div className="space-y-4">
        <Card className="!p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Review der Extraktion</h2>
              <p className="mt-1 text-xs text-slate-500">
                Prüfe die KI-Extraktion. Nichts wird ohne deine Bestätigung gespeichert. Einzelne Einträge
                kannst du beim Bestätigen ausschließen.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {stillRunning ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              {summary ? (
                <>
                  <Badge tone="success">{summary.completed} erfolgreich</Badge>
                  {summary.failed > 0 ? <Badge tone="warn">{summary.failed} fehlgeschlagen</Badge> : null}
                  {summary.running > 0 ? <Badge tone="primary">{summary.running} läuft</Badge> : null}
                </>
              ) : null}
            </div>
          </div>

          {extractProgress ? (
            <p className="mt-3 text-xs text-slate-500">
              {extractProgress.done} von {extractProgress.total} Einträgen verarbeitet.
            </p>
          ) : null}
        </Card>

        {failedJobs.length > 0 ? (
          <Card className="!p-5">
            <h3 className="text-sm font-semibold text-amber-800">Fehlgeschlagene Einträge</h3>
            <ul className="mt-2 space-y-2 text-xs text-slate-700">
              {failedJobs.map((j) => (
                <li key={j.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <div className="font-medium">
                    {j.subject} · {j.grade_band} · {j.topic_hint}
                  </div>
                  <div className="text-amber-800">
                    {Array.isArray(j.validation_errors) && j.validation_errors.length > 0
                      ? j.validation_errors.join(' · ')
                      : 'Unbekannter Fehler.'}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {Object.entries(groupedBySubject).map(([subjectName, jobs]) => (
          <Card key={subjectName} className="!p-5">
            <h3 className="text-base font-semibold text-slate-900">{subjectName}</h3>
            <ul className="mt-3 space-y-3">
              {jobs.map((j) => {
                const planIdx = j.plan_index ?? -1;
                const skipped = skipIndices.has(planIdx);
                const ctx = formatExtractedContext(j);
                return (
                  <li
                    key={j.id}
                    className={cn(
                      'rounded-xl border border-slate-200 bg-white p-3 transition',
                      skipped && 'opacity-60',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900">
                          {(j.extracted_context as { topic_area?: string })?.topic_area || j.topic_hint}
                        </div>
                        <div className="text-[12px] text-slate-500">
                          Klassenband {j.grade_band} · Seiten {j.page_start}–{j.page_end}
                        </div>
                      </div>
                      <label className="inline-flex items-center gap-1 text-[12px] text-slate-600">
                        <input
                          type="checkbox"
                          checked={skipped}
                          onChange={() => toggleSkip(planIdx)}
                          className="h-3.5 w-3.5 accent-violet-600"
                        />
                        nicht aktivieren
                      </label>
                    </div>
                    {ctx.summary ? (
                      <p className="mt-2 text-[12px] leading-snug text-slate-600">{ctx.summary}</p>
                    ) : null}
                    {ctx.subtopics.length > 0 ? (
                      <p className="mt-2 text-[12px] text-slate-700">
                        <span className="font-medium">Unterthemen:</span> {ctx.subtopics.slice(0, 8).join(', ')}
                      </p>
                    ) : null}
                    {ctx.competencies.length > 0 ? (
                      <p className="mt-1 text-[12px] text-slate-700">
                        <span className="font-medium">Kompetenzen:</span>{' '}
                        {ctx.competencies.slice(0, 6).join(' · ')}
                      </p>
                    ) : null}
                    {ctx.tasks.length > 0 ? (
                      <p className="mt-1 text-[12px] text-slate-700">
                        <span className="font-medium">Aufgabentypen:</span> {ctx.tasks.join(', ')}
                      </p>
                    ) : null}
                    {ctx.rules.length > 0 ? (
                      <p className="mt-1 text-[12px] text-slate-700">
                        <span className="font-medium">Regeln:</span> {ctx.rules.slice(0, 6).join(' · ')}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" leftIcon={<ArrowLeft size={14} aria-hidden />} onClick={() => setStep(1)}>
            Zurück
          </Button>
          <Button
            loading={busy}
            disabled={busy || stillRunning || completedJobs.length === 0}
            leftIcon={<CheckCircle2 size={14} aria-hidden />}
            onClick={() => void finalApprove()}
          >
            Bestätigen & aktivieren
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeader
        title="RLP-PDF auto-extrahieren"
        subtitle="In drei Schritten von einer Lehrplan-PDF zu strukturierten Curriculum-Kontexten."
        actions={
          <Button as="link" variant="secondary" to="/app/curricula/sources" leftIcon={<FileText size={14} aria-hidden />}>
            Zur Quellenliste
          </Button>
        }
      />
      <Card className="!p-4">
        <StepIndicator current={step} />
      </Card>
      {step === 0 ? renderStep0() : null}
      {step === 1 ? renderStep1() : null}
      {step === 2 ? renderStep2() : null}
      <p className="text-[11px] text-slate-400">
        Hinweis: Diese Auto-Extraktion ersetzt keine fachliche Prüfung. Validiere die Ergebnisse vor Aktivierung.
        Eine Garantie auf Lehrplankonformität wird nicht gegeben.
      </p>
    </div>
  );
}

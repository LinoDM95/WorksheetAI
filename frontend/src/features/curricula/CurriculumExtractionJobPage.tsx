import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Button, Card, Alert, Field } from '../../components/ui';
import {
  approveJob,
  fetchExtractionJob,
  patchJobContext,
  rejectJob,
  runExtractionJob,
  type CurriculumExtractionJob,
} from './curriculaApi';

export function CurriculumExtractionJobPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<CurriculumExtractionJob | null>(null);
  const [jsonText, setJsonText] = useState('{}');
  const [rejectNotes, setRejectNotes] = useState('');
  const [activate, setActivate] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    fetchExtractionJob(id)
      .then((j) => {
        setJob(j);
        setJsonText(JSON.stringify(j.extracted_context || {}, null, 2));
      })
      .catch(() => setErr('Job nicht gefunden.'));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRun = async () => {
    if (!id) return;
    setBusy(true);
    setErr('');
    try {
      const j = await runExtractionJob(id);
      setJob(j);
      setJsonText(JSON.stringify(j.extracted_context || {}, null, 2));
    } catch {
      setErr('KI-Lauf fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveJson = async () => {
    if (!id) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      setErr('JSON ungültig.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const j = await patchJobContext(id, parsed);
      setJob(j);
    } catch {
      setErr('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    let edited: Record<string, unknown> | undefined;
    try {
      edited = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      setErr('JSON ungültig.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await approveJob(id, { edited_context: edited, activate });
      const ctx = (res as { context?: { id: string } }).context;
      if (ctx?.id) navigate(`/app/curricula/contexts/${ctx.id}`);
      else void load();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(typeof d === 'string' ? d : 'Freigabe fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await rejectJob(id, rejectNotes);
      void load();
    } catch {
      setErr('Ablehnen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  if (!id) return <p className="p-6">Ungültig.</p>;
  if (!job && !err) return <p className="p-6 text-slate-600">Lade …</p>;
  if (!job) return <Alert tone="error">{err}</Alert>;

  const excerpt = JSON.stringify(job.source_excerpt || {}, null, 2);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader
        title={`Extraktionsjob`}
        subtitle={`${job.source_title || job.source} · ${job.status} · Review: ${job.review_status}`}
        actions={
          <Button variant="secondary" as="link" to={`/app/curricula/sources/${job.source}`}>
            Zur Quelle
          </Button>
        }
      />
      {err ? <Alert tone="error">{err}</Alert> : null}
      {job.validation_errors?.length ? (
        <Alert tone="warn">{job.validation_errors.join(' · ')}</Alert>
      ) : null}
      {job.extraction_summary ? (
        <Card className="!p-3 text-sm text-slate-700">{job.extraction_summary}</Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="!p-4">
          <h2 className="text-sm font-semibold text-slate-900">Quelltext-Auszug (PDF-Seiten)</h2>
          <pre className="mt-2 max-h-[480px] overflow-auto rounded bg-slate-50 p-2 text-[11px] leading-snug">{excerpt}</pre>
        </Card>
        <Card className="!p-4">
          <h2 className="text-sm font-semibold text-slate-900">Extrahierter Curriculum-Kontext (JSON)</h2>
          <textarea
            className="mt-2 h-[420px] w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px]"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void handleSaveJson()}>
              JSON übernehmen
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void handleRun()}>
              KI erneut ausführen
            </Button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
            Nach Freigabe aktivieren (sofern Review-Regeln es erlauben)
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void handleApprove()}>
              Übernehmen / freigeben
            </Button>
          </div>
          <Field label="Ablehnung — Notiz" htmlFor="rj" className="mt-4">
            <textarea id="rj" className="input min-h-[72px]" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} />
          </Field>
          <Button variant="danger" size="sm" className="mt-2" disabled={busy} onClick={() => void handleReject()}>
            Ablehnen
          </Button>
        </Card>
      </div>
    </div>
  );
}

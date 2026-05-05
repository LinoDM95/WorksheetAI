import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Button, Card, Alert, Field } from '../../components/ui';
import {
  createExtractionJob,
  extractCurriculumSourceText,
  fetchCurriculumSource,
  type CurriculumSource,
} from './curriculaApi';

export function CurriculumSourceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [src, setSrc] = useState<CurriculumSource | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [subject, setSubject] = useState('Mathematik');
  const [gradeBand, setGradeBand] = useState('1-2');
  const [levels, setLevels] = useState('A,B,C');
  const [topicHint, setTopicHint] = useState('');
  const [pageStart, setPageStart] = useState('50');
  const [pageEnd, setPageEnd] = useState('51');

  const load = useCallback(() => {
    if (!id) return;
    setErr('');
    fetchCurriculumSource(id)
      .then(setSrc)
      .catch(() => setErr('Quelle nicht gefunden.'));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExtract = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const s = await extractCurriculumSourceText(id);
      setSrc(s);
    } catch {
      setErr('Text-Extraktion fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartJob = async () => {
    if (!id) return;
    setBusy(true);
    setErr('');
    try {
      const job = await createExtractionJob({
        source_id: id,
        state: src?.state || '',
        subject: subject.trim(),
        grade_band: gradeBand.trim(),
        level_band: levels.split(',').map((x) => x.trim()).filter(Boolean),
        topic_hint: topicHint.trim(),
        page_start: pageStart ? Number(pageStart) : null,
        page_end: pageEnd ? Number(pageEnd) : null,
        selected_pages: [],
      });
      navigate(`/app/curricula/jobs/${job.id}`);
    } catch {
      setErr('Extraktionsjob konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  };

  if (!id) return <p className="p-6 text-slate-600">Ungültige Adresse.</p>;
  if (!src && !err) return <p className="p-6 text-slate-600">Lade …</p>;
  if (!src) return <Alert tone="error">{err}</Alert>;

  const pages = Array.isArray(src.extracted_pages) ? src.extracted_pages : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeader
        title={src.title}
        subtitle={`${src.state} · ${src.extraction_status} · ${src.page_count} Seiten`}
        actions={
          <Button variant="secondary" as="link" to="/app/curricula/sources">
            Zur Übersicht
          </Button>
        }
      />
      {err ? <Alert tone="error">{err}</Alert> : null}

      <Card className="!p-5">
        <h2 className="text-sm font-semibold text-slate-900">Text extrahieren</h2>
        <p className="mt-1 text-xs text-slate-500">
          Pro Seite wird lesbarer Text gespeichert (kein OCR). Leere Seiten bleiben ohne Text.
        </p>
        <Button className="mt-3" disabled={busy} onClick={() => void handleExtract()}>
          Text extrahieren
        </Button>
      </Card>

      <Card className="!p-5">
        <h2 className="text-sm font-semibold text-slate-900">Seitenüberblick</h2>
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-xs">
          {pages.map((p: any) => (
            <li key={p.page} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
              <span className="font-semibold">Seite {p.page}</span> · {p.char_count ?? 0} Zeichen ·{' '}
              {p.has_text ? 'Text' : 'ohne Text'}
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600">
                {(p.preview_text as string) || '—'}
              </pre>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="!p-5">
        <h2 className="text-sm font-semibold text-slate-900">Curriculum-Kontext mit KI erzeugen</h2>
        <p className="mt-1 text-xs text-slate-500">Maximal 8 Seiten pro Lauf (Server-Limit).</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Fach" htmlFor="cj-sub">
            <input id="cj-sub" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Klassenband" htmlFor="cj-gb">
            <input id="cj-gb" className="input" value={gradeBand} onChange={(e) => setGradeBand(e.target.value)} />
          </Field>
          <Field label="Niveaustufen (kommagetrennt)" htmlFor="cj-lv">
            <input id="cj-lv" className="input" value={levels} onChange={(e) => setLevels(e.target.value)} />
          </Field>
          <Field label="Themenhinweis" htmlFor="cj-th">
            <input id="cj-th" className="input" value={topicHint} onChange={(e) => setTopicHint(e.target.value)} />
          </Field>
          <Field label="Seite von" htmlFor="cj-ps">
            <input id="cj-ps" className="input" inputMode="numeric" value={pageStart} onChange={(e) => setPageStart(e.target.value)} />
          </Field>
          <Field label="Seite bis" htmlFor="cj-pe">
            <input id="cj-pe" className="input" inputMode="numeric" value={pageEnd} onChange={(e) => setPageEnd(e.target.value)} />
          </Field>
        </div>
        <Button className="mt-4" disabled={busy || src.extraction_status !== 'extracted'} onClick={() => void handleStartJob()}>
          Job anlegen und zur Prüfung öffnen
        </Button>
      </Card>
    </div>
  );
}

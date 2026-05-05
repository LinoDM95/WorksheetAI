import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Button, Card, EmptyState, Alert, Field } from '../../components/ui';
import {
  createCurriculumSource,
  fetchCurriculumSources,
  type CurriculumSource,
} from './curriculaApi';

export function CurriculumSourcesPage() {
  const [items, setItems] = useState<CurriculumSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [state, setState] = useState('Berlin/Brandenburg');
  const [docType, setDocType] = useState('rlp_kompakt');
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(() => {
    setErr('');
    setLoading(true);
    fetchCurriculumSources()
      .then(setItems)
      .catch(() => setErr('Quellen konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setErr('Titel und PDF-Datei sind erforderlich.');
      return;
    }
    setBusy(true);
    setErr('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title.trim());
    fd.append('state', state.trim());
    fd.append('document_type', docType);
    fd.append('country', 'DE');
    try {
      await createCurriculumSource(fd);
      setTitle('');
      setFile(null);
      await load();
    } catch {
      setErr('Upload fehlgeschlagen (nur PDF, max. Größe laut Server).');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <PageHeader
        title="Lehrplan-Quellen (PDF)"
        subtitle="Manuelle Verwaltung. Für Auto-Extraktion bitte den Wizard verwenden."
        actions={
          <>
            <Button as="link" to="/app/curricula/auto">
              RLP-PDF auto-extrahieren
            </Button>
            <Button as="link" variant="secondary" to="/app/curricula/contexts">
              Curriculum-Kontexte
            </Button>
          </>
        }
      />

      <Card className="!p-5">
        <h2 className="text-sm font-semibold text-slate-900">RLP-PDF hochladen</h2>
        <p className="mt-1 text-xs text-slate-500">
          Rahmenlehrpläne werden nicht bei jeder Arbeitsblatt-Erstellung an die KI geschickt. Stattdessen entstehen
          daraus kompakte, geprüfte Curriculum-Kontexte.
        </p>
        <p className="mt-2 text-xs font-medium text-amber-800">
          KI-Extraktion sollte vor Aktivierung fachlich geprüft werden.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Titel" htmlFor="cs-title">
            <input id="cs-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Bundesland / Region" htmlFor="cs-state">
            <input id="cs-state" className="input" value={state} onChange={(e) => setState(e.target.value)} />
          </Field>
          <Field label="Dokumenttyp" htmlFor="cs-dt">
            <select id="cs-dt" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="rlp_kompakt">RLP kompakt</option>
              <option value="teil_a">Teil A</option>
              <option value="teil_b">Teil B</option>
              <option value="teil_c_subject">Teil C / Fach</option>
              <option value="other">Sonstiges</option>
            </select>
          </Field>
          <Field label="PDF-Datei" htmlFor="cs-file">
            <input
              id="cs-file"
              type="file"
              accept="application/pdf"
              className="text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>
        <Button className="mt-4" disabled={busy} onClick={() => void handleUpload()}>
          Hochladen
        </Button>
      </Card>

      {err ? <Alert tone="error">{err}</Alert> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Lade …</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Noch keine Lehrplan-PDFs"
          description="Lade echte RLP-PDFs hoch. Die Lehrplanverwaltung startet leer — es werden keine Beispiel-Kontexte angelegt."
          action={
            <span className="text-xs text-slate-500">
              Nutze das Formular oben oder die Detailseite für Text-Extraktion.
            </span>
          }
        />
      ) : (
        <Card flush className="overflow-hidden">
          <ul className="divide-y divide-slate-200">
            {items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <Link className="font-medium text-violet-700 hover:underline" to={`/app/curricula/sources/${s.id}`}>
                    {s.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {s.state} · {s.extraction_status} · {s.page_count} Seiten · Jobs {s.jobs_count ?? '—'} · Kontexte{' '}
                    {s.contexts_count ?? '—'}
                  </p>
                </div>
                <span className="text-xs text-slate-400">{s.id.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

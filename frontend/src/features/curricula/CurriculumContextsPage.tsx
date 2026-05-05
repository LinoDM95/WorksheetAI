import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Button, Card, EmptyState, Alert, Badge } from '../../components/ui';
import { fetchCurriculumContexts, type CurriculumContextRow } from './curriculaApi';

const qLabel: Record<string, string> = {
  unchecked: 'ungeprüft',
  ai_extracted: 'KI-extrahiert',
  human_reviewed: 'manuell geprüft',
};

export function CurriculumContextsPage() {
  const [items, setItems] = useState<CurriculumContextRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setErr('');
    setLoading(true);
    fetchCurriculumContexts()
      .then(setItems)
      .catch(() => setErr('Kontexte konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeader
        title="Curriculum-Kontexte"
        subtitle="Aktive Kontexte werden beim Erstellen von Arbeitsblättern gematcht — orientierend, ohne Garantie der Lehrplankonformität."
        actions={
          <Button as="link" variant="secondary" to="/app/curricula/sources">
            PDF hochladen
          </Button>
        }
      />
      {err ? <Alert tone="error">{err}</Alert> : null}
      {loading ? (
        <p className="text-sm text-slate-500">Lade …</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Noch keine Lehrplan-Kontexte vorhanden."
          description="Lade echte RLP-PDFs hoch und extrahiere daraus geprüfte Curriculum-Kontexte."
        />
      ) : (
        <Card flush className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Bundesland</th>
                <th className="px-4 py-2">Fach</th>
                <th className="px-4 py-2">Band</th>
                <th className="px-4 py-2">Themenfeld</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Qualität</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">{c.state}</td>
                  <td className="px-4 py-2">
                    <Link className="text-violet-700 hover:underline" to={`/app/curricula/contexts/${c.id}`}>
                      {c.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{c.grade_band}</td>
                  <td className="max-w-[220px] truncate px-4 py-2" title={c.topic_area}>
                    {c.topic_area}
                  </td>
                  <td className="px-4 py-2">
                    <Badge>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs">{qLabel[c.quality_status] ?? c.quality_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

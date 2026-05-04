import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Worksheet } from '../../types';

type ListItem = Pick<Worksheet, 'id' | 'title' | 'subject' | 'grade' | 'status' | 'updated_at'>;

export function MyWorksheetsPage() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setErr('');
    setLoading(true);
    api
      .get('/worksheets/')
      .then((r) => {
        const raw = r.data.results ?? r.data;
        setItems(Array.isArray(raw) ? raw : []);
      })
      .catch(() => setErr('Liste konnte nicht geladen werden.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Arbeitsblatt „${title}“ wirklich löschen?`)) return;
    setDeleting(id);
    setErr('');
    try {
      await api.delete(`/worksheets/${id}/`);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      setErr('Löschen fehlgeschlagen.');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <p className="text-slate-600">Lade Arbeitsblätter…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Meine Arbeitsblätter</h1>
        <p className="mt-1 text-sm text-slate-600">
          Jedes erzeugte Blatt wird hier gespeichert. Öffnen zum Bearbeiten oder Drucken, oder löschen.
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          Noch keine Arbeitsblätter.{' '}
          <Link to="/app" className="font-medium text-indigo-600 hover:underline">
            Neues Blatt erstellen
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {items.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/app/worksheets/${w.id}`}
                  className="font-medium text-indigo-700 hover:underline"
                >
                  {w.title || 'Ohne Titel'}
                </Link>
                <div className="text-xs text-slate-500">
                  {[w.subject, w.grade != null ? `Klasse ${w.grade}` : null].filter(Boolean).join(' · ') ||
                    '—'}
                  {w.updated_at ? ` · ${new Date(String(w.updated_at)).toLocaleString('de-DE')}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/app/worksheets/${w.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Öffnen
                </Link>
                <button
                  type="button"
                  disabled={deleting === w.id}
                  onClick={() => handleDelete(w.id, w.title || '')}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                >
                  {deleting === w.id ? '…' : 'Löschen'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

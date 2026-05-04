import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Filter, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { WORKSHEET_LIST_QUERY_KEY, WORKSHEET_LIST_STALE_MS, fetchWorksheetList } from '../../lib/listQueries';
import { formatDate } from '../../lib/formatDate';
import type { Worksheet } from '../../types';
import { MockBadge } from '../../components/MockBadge';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  IconButton,
  MiniThumbnail,
  PageHeader,
  SearchInput,
  StatusBadge,
} from '../../components/ui';

type ListItem = Pick<Worksheet, 'id' | 'title' | 'subject' | 'grade' | 'status' | 'updated_at'>;

const LIST_GRID_COLS = 'lg:grid-cols-[60px_1fr_180px_120px_120px_120px_120px]';

export function MyWorksheetsPage() {
  const queryClient = useQueryClient();
  const {
    data: items = [],
    isPending: loading,
    isError,
  } = useQuery({
    queryKey: WORKSHEET_LIST_QUERY_KEY,
    queryFn: () => fetchWorksheetList<ListItem>(),
    staleTime: WORKSHEET_LIST_STALE_MS,
  });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [deleteErr, setDeleteErr] = useState('');

  const errMessage = isError ? 'Liste konnte nicht geladen werden.' : deleteErr;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (w) =>
        w.title?.toLowerCase().includes(q) ||
        w.subject?.toLowerCase().includes(q) ||
        String(w.grade ?? '').includes(q),
    );
  }, [items, query]);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Arbeitsblatt „${title}“ wirklich löschen?`)) return;
    setDeleting(id);
    setDeleteErr('');
    try {
      await api.delete(`/worksheets/${id}/`);
      await queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
    } catch {
      setDeleteErr('Löschen fehlgeschlagen.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5">
      <PageHeader
        title="Meine Arbeitsblätter"
        subtitle={
          loading
            ? 'Lade …'
            : `${items.length} Arbeitsblätter — du kannst sie öffnen, drucken oder löschen.`
        }
        actions={
          <>
            <Button variant="secondary" disabled title="Filter — Mockup" leftIcon={<Filter size={14} aria-hidden />}>
              Filter
            </Button>
            <Button as="link" to="/app/create" leftIcon={<Plus size={14} aria-hidden />}>
              Neues Blatt
            </Button>
          </>
        }
      />

      <Card flush className="flex flex-wrap items-center gap-2 p-3">
        <SearchInput
          placeholder="In Titel, Fach oder Klasse suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Arbeitsblätter durchsuchen"
        />
      </Card>

      {errMessage && <Alert tone="error">{errMessage}</Alert>}

      {loading ? (
        <p className="text-slate-500">Lade Arbeitsblätter …</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Noch keine Arbeitsblätter"
          description="Erstelle dein erstes druckfertiges Blatt mit dem Assistenten."
          action={
            <Button as="link" to="/app/create" leftIcon={<Plus size={14} aria-hidden />}>
              Neues Blatt
            </Button>
          }
        />
      ) : (
        <Card flush overflowHidden>
          <div
            className={`hidden border-b border-slate-200 px-5 py-3 text-[11.5px] font-bold uppercase tracking-wider text-slate-500 lg:grid lg:items-center ${LIST_GRID_COLS}`}
          >
            <span />
            <span>Titel</span>
            <span>Fach</span>
            <span>Klasse</span>
            <span>Status</span>
            <span>Geändert</span>
            <span />
          </div>
          <ul className="divide-y divide-slate-200">
            {filtered.map((w) => (
              <WorksheetRow
                key={w.id}
                item={w}
                deleting={deleting === w.id}
                onDelete={() => void handleDelete(w.id, w.title || '')}
              />
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        Hinweis: Die Mini-Thumbnails in dieser Liste sind <MockBadge variant="inline" /> — eine
        echte Vorschau-Generierung pro Arbeitsblatt folgt.
      </p>
    </div>
  );
}

const WorksheetRow = ({
  item,
  deleting,
  onDelete,
}: {
  item: ListItem;
  deleting: boolean;
  onDelete: () => void;
}) => {
  const editHref = `/app/worksheets/${item.id}`;
  const titleLabel = item.title || 'Ohne Titel';
  return (
    <li
      className={`grid items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5 ${LIST_GRID_COLS}`}
    >
      <MiniThumbnail responsive />
      <Link
        to={editHref}
        className="truncate text-left text-sm font-semibold text-slate-900 hover:text-indigo-700 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        {titleLabel}
      </Link>
      <span className="text-[13px] text-slate-700">{item.subject || '—'}</span>
      <span className="text-[13px] text-slate-700">
        {item.grade != null ? `Kl. ${item.grade}` : '—'}
      </span>
      <span>
        <StatusBadge status={item.status ?? 'draft'} />
      </span>
      <span className="text-[12.5px] text-slate-500">{formatDate(item.updated_at as string)}</span>
      <div className="flex justify-end gap-1">
        <IconButton
          as="link"
          to={editHref}
          aria-label={`„${titleLabel}“ öffnen`}
          title="Bearbeiten / Drucken"
        >
          <Pencil size={13} aria-hidden />
        </IconButton>
        <IconButton
          aria-label="Drucken (Editor öffnen)"
          title="Aktuell offene Seite drucken (öffnet zuerst Editor)"
          disabled
        >
          <Printer size={13} aria-hidden />
        </IconButton>
        <IconButton
          variant="danger"
          aria-label={`„${titleLabel}“ löschen`}
          title="Löschen"
          disabled={deleting}
          onClick={onDelete}
          className="text-red-600 hover:bg-red-50"
        >
          <Trash2 size={13} aria-hidden />
        </IconButton>
      </div>
    </li>
  );
};

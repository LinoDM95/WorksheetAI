import { useCallback, useMemo, useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { WORKSHEET_LIST_QUERY_KEY, WORKSHEET_LIST_STALE_MS, fetchWorksheetList } from '../../lib/listQueries';
import { formatDate } from '../../lib/formatDate';
import type { Worksheet } from '../../types';
import {
  Alert,
  Button,
  EmptyState,
  IconButton,
  SearchInput,
  StatusBadge,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { WorksheetPage } from './WorksheetPage';
import { ChevronDown, FileText, Folder as FolderIcon, FolderPlus, Plus, Trash2 } from 'lucide-react';

type ListItem = Pick<Worksheet, 'id' | 'title' | 'subject' | 'grade' | 'status' | 'updated_at'>;

const NO_SUBJECT_LABEL = 'Ohne Fach';

function sortFolderKeys(keys: string[]) {
  return [...keys].sort((a, b) => {
    if (a === NO_SUBJECT_LABEL) return 1;
    if (b === NO_SUBJECT_LABEL) return -1;
    return a.localeCompare(b, 'de');
  });
}

export function WorksheetEditorPlaceholder() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 bg-[var(--color-bg-app)] p-8 text-center lg:min-h-0">
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-8 py-10 shadow-sm">
        <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden />
        <p className="text-sm font-semibold text-slate-800">Arbeitsblatt auswählen</p>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
          Klicke links in der Liste auf ein Blatt. Die Seiten erscheinen hier — bearbeiten, ausfüllen und drucken
          ohne die Ansicht zu wechseln.
        </p>
      </div>
    </div>
  );
}

export function WorksheetWorkspacePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedMatch = matchPath({ path: '/app/worksheets/:id', end: true }, location.pathname);
  const selectedId = selectedMatch?.params?.id;

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

  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState('');
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(() => new Set());

  const toggleSubject = useCallback((key: string) => {
    setCollapsedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (w) =>
        w.title?.toLowerCase().includes(q) ||
        w.subject?.toLowerCase().includes(q) ||
        String(w.grade ?? '').includes(q),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const m = new Map<string, ListItem[]>();
    for (const w of filteredItems) {
      const key = (w.subject || '').trim() || NO_SUBJECT_LABEL;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(w);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const tb = new Date(String(b.updated_at ?? 0)).getTime();
        const ta = new Date(String(a.updated_at ?? 0)).getTime();
        if (tb !== ta) return tb - ta;
        return (a.title || '').localeCompare(b.title || '', 'de');
      });
    }
    return m;
  }, [filteredItems]);

  const folderKeys = useMemo(() => sortFolderKeys([...grouped.keys()]), [grouped]);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Arbeitsblatt „${title}“ wirklich löschen?`)) return;
    setDeleting(id);
    setDeleteErr('');
    try {
      await api.delete(`/worksheets/${id}/`);
      await queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      if (id === selectedId) navigate('/app/worksheets', { replace: true });
    } catch {
      setDeleteErr('Löschen fehlgeschlagen.');
    } finally {
      setDeleting(null);
    }
  };

  const errMessage = isError ? 'Liste konnte nicht geladen werden.' : deleteErr;

  return (
    <div className="flex min-h-full w-full flex-1 flex-col lg:flex-row">
      <aside
        className={cn(
          'flex max-h-[44vh] shrink-0 flex-col border-slate-200 bg-[var(--color-bg-card)] lg:max-h-none lg:w-[min(100%,300px)] lg:max-w-[340px] lg:border-r',
          'border-b lg:border-b-0',
        )}
      >
        <div className="shrink-0 space-y-2 border-b border-slate-100 p-2">
          <div className="flex flex-nowrap gap-1.5">
            <Button
              as="link"
              to="/app/patterns"
              variant="secondary"
              size="sm"
              className="min-w-0 flex-1"
            >
              <span className="truncate">Vorlagen</span>
            </Button>
            <Button
              as="link"
              to="/app/create"
              size="sm"
              leftIcon={<Plus size={14} aria-hidden />}
              className="min-w-0 flex-1"
            >
              <span className="truncate">Neues Blatt</span>
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              disabled
              aria-label="Ordner (in Kürze)"
              title="Eigene Ordner für Arbeitsblätter folgen — derzeit Gruppierung nach Fach"
            >
              <FolderPlus size={18} aria-hidden />
            </IconButton>
            <SearchInput
              placeholder="Titel, Fach, Klasse …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Arbeitsblätter durchsuchen"
              containerClassName="min-w-0 flex-1"
            />
          </div>
        </div>

        {errMessage ? (
          <div className="shrink-0 p-2">
            <Alert tone="error">{errMessage}</Alert>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2">
          {loading ? (
            <p className="px-2 text-sm text-slate-500">Lade …</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="Noch keine Arbeitsblätter"
              description="Lege ein druckfertiges Blatt mit dem Assistenten an."
              action={
                <Button as="link" to="/app/create" size="sm" leftIcon={<Plus size={14} aria-hidden />}>
                  Neues Blatt
                </Button>
              }
            />
          ) : (
            <>
              <div className="px-1 pb-2">
                <NavLink
                  to="."
                  end
                  className={({ isActive }) =>
                    cn(
                      'block rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                      isActive ? 'bg-indigo-50 text-indigo-900' : 'text-slate-500 hover:bg-slate-50',
                    )
                  }
                >
                  Galerie
                </NavLink>
                <p className="mt-1 px-2 text-[10px] leading-snug text-slate-400">
                  Arbeitsblätter sind nach <span className="font-semibold text-slate-500">Fach</span> gruppiert — wie
                  Ordner. Klick auf den Titel öffnet das Blatt; Status und Klasse siehst du unter dem Namen.
                </p>
              </div>

              {filteredItems.length === 0 ? (
                <p className="px-2 text-sm text-slate-500">Keine Treffer — Suche anpassen.</p>
              ) : (
                <ul className="space-y-0.5">
                  {folderKeys.map((subjectKey) => {
                    const rows = grouped.get(subjectKey) ?? [];
                    if (rows.length === 0) return null;
                    const collapsed = collapsedSubjects.has(subjectKey);
                    return (
                      <li key={subjectKey} className="select-none">
                        <div className="flex w-full max-w-full items-stretch gap-0.5">
                          <button
                            type="button"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-400"
                            aria-expanded={!collapsed}
                            aria-label={collapsed ? `„${subjectKey}“ ausklappen` : `„${subjectKey}“ einklappen`}
                            onClick={() => toggleSubject(subjectKey)}
                          >
                            <ChevronDown
                              className={cn('h-4 w-4 transition-transform duration-150', collapsed && '-rotate-90')}
                              aria-hidden
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSubject(subjectKey)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 pr-1.5 pl-0.5 text-left text-[13px] text-slate-800 transition-colors hover:bg-slate-50"
                          >
                            <FolderIcon size={14} className="shrink-0 text-slate-500" aria-hidden />
                            <span className="min-w-0 flex-1 truncate font-medium">{subjectKey}</span>
                            <span className="shrink-0 tabular-nums text-[11px] text-slate-400">{rows.length}</span>
                          </button>
                        </div>
                        {!collapsed ? (
                          <ul className="mt-0.5 space-y-0.5 border-l border-slate-100 pl-1.5 ml-[0.875rem]">
                            {rows.map((w) => {
                              const titleLabel = w.title || 'Ohne Titel';
                              const active = selectedId === w.id;
                              return (
                                <li key={w.id} className="group/row">
                                  <div
                                    className={cn(
                                      'flex max-w-full items-center gap-0.5 rounded-lg pr-0.5 transition-colors',
                                      active ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-slate-50',
                                    )}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <NavLink
                                        to={w.id}
                                        className={cn(
                                          'flex min-w-0 items-center gap-2 rounded-lg py-1.5 pr-1 pl-1 text-left text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                                          active ? 'font-medium' : 'font-normal text-slate-800',
                                        )}
                                        title={titleLabel}
                                      >
                                        <FileText
                                          size={14}
                                          className={cn('shrink-0', active ? 'text-indigo-600' : 'text-slate-400')}
                                          aria-hidden
                                        />
                                        <span className="min-w-0 flex-1 truncate">{titleLabel}</span>
                                        <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">
                                          {formatDate(w.updated_at as string)}
                                        </span>
                                      </NavLink>
                                    </div>
                                    <IconButton
                                      variant="danger"
                                      size="sm"
                                      className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                                      aria-label={`„${titleLabel}“ löschen`}
                                      title="Löschen"
                                      disabled={deleting === w.id}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        void handleDelete(w.id, titleLabel);
                                      }}
                                    >
                                      <Trash2 size={12} aria-hidden />
                                    </IconButton>
                                  </div>
                                  <div className="pb-1 pl-1 flex items-center gap-1">
                                    <StatusBadge status={w.status ?? 'draft'} />
                                    {w.grade != null ? (
                                      <span className="text-[10px] text-slate-500">Kl. {w.grade}</span>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-app)] lg:min-h-0">
        <Outlet />
      </section>
    </div>
  );
}

export function WorksheetPageOutlet() {
  const { id } = useParams();
  return <WorksheetPage key={id} />;
}

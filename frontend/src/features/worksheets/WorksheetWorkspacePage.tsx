import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { NavLink, Outlet, matchPath, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  addPendingFirstOpenWorksheet,
  getPendingFirstOpenWorksheetIds,
} from './lib/worksheetFirstOpenHighlight';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { WORKSHEET_LIST_QUERY_KEY, WORKSHEET_LIST_STALE_MS, fetchWorksheetList } from '../../lib/listQueries';
import { formatDate } from '../../lib/formatDate';
import type { Worksheet } from '../../types';
import { Alert, Button, EmptyState, IconButton, SearchInput } from '../../components/ui';
import { cn } from '../../lib/cn';
import { LG_MEDIA_QUERY, useMediaQuery } from '../../lib/useMediaQuery';
import type { WorkspaceMobileTab } from '../../components/shell/MobileWorkspaceTabs';
import {
  WorkspaceExplorerFrame,
  WorkspaceExplorerGalerieHint,
  WorkspaceExplorerListScroll,
  WorkspaceExplorerSectionRule,
  WorkspaceExplorerToolbar,
} from '../../components/workspace/WorkspaceExplorer';
import { ExplorerListItemContextMenuPortal } from '../../components/workspace/ExplorerListItemContextMenu';
import { ExplorerFolderContextMenuPortal } from '../../components/workspace/ExplorerFolderContextMenu';
import { WorksheetPage } from './WorksheetPage';
import { ChevronDown, FileText, Folder as FolderIcon, FolderPlus, Plus, Trash2 } from 'lucide-react';

type ListItem = Pick<Worksheet, 'id' | 'title' | 'subject' | 'grade' | 'status' | 'updated_at'> & {
  render_model?: { subtitle?: string } | null;
};
type WorksheetMenuState = { x: number; y: number; worksheetId: string };
type WorksheetFolderMenuState = { x: number; y: number; subjectKey: string };

const WORKSHEET_SUBJECT_MAX_LEN = 120;

function sortSubjectKeys(keys: string[]) {
  return [...keys].sort((a, b) => a.localeCompare(b, 'de'));
}

function sortWorksheetListItems(rows: ListItem[]) {
  return [...rows].sort((a, b) => {
    const tb = new Date(String(b.updated_at ?? 0)).getTime();
    const ta = new Date(String(a.updated_at ?? 0)).getTime();
    if (tb !== ta) return tb - ta;
    return (a.title || '').localeCompare(b.title || '', 'de');
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
  const [worksheetMenu, setWorksheetMenu] = useState<WorksheetMenuState | null>(null);
  const [folderMenu, setFolderMenu] = useState<WorksheetFolderMenuState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState('');
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(() => new Set());
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);
  const isLg = useMediaQuery(LG_MEDIA_QUERY);
  const [mobileTab, setMobileTab] = useState<WorkspaceMobileTab>('list');
  const [pendingFirstOpenIds, setPendingFirstOpenIds] = useState<string[]>(() => [
    ...getPendingFirstOpenWorksheetIds(),
  ]);

  useEffect(() => {
    const onGallery = matchPath({ path: '/app/worksheets', end: true }, location.pathname);
    if (onGallery) {
      setPendingFirstOpenIds([...getPendingFirstOpenWorksheetIds()]);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (isLg) return;
    setMobileTab(selectedId ? 'content' : 'list');
  }, [selectedId, isLg]);

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
    return items.filter((w) => {
      const rmSub = String(w.render_model?.subtitle ?? '').toLowerCase();
      return (
        w.title?.toLowerCase().includes(q) ||
        w.subject?.toLowerCase().includes(q) ||
        rmSub.includes(q) ||
        String(w.grade ?? '').includes(q)
      );
    });
  }, [items, query]);

  const ungroupedItems = useMemo(() => {
    const list = filteredItems.filter((w) => !(w.subject || '').trim());
    return sortWorksheetListItems(list);
  }, [filteredItems]);

  const subjectGrouped = useMemo(() => {
    const m = new Map<string, ListItem[]>();
    for (const w of filteredItems) {
      const key = (w.subject || '').trim();
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(w);
    }
    for (const arr of m.values()) {
      sortWorksheetListItems(arr);
    }
    return m;
  }, [filteredItems]);

  const folderKeys = useMemo(() => sortSubjectKeys([...subjectGrouped.keys()]), [subjectGrouped]);

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

  const worksheetMenuTarget = useMemo(
    () => (worksheetMenu ? items.find((w) => w.id === worksheetMenu.worksheetId) ?? null : null),
    [worksheetMenu, items],
  );

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch(`/worksheets/${id}/`, { title }).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      setWorksheetMenu(null);
      setDeleteErr('');
    },
    onError: () => {
      setDeleteErr('Umbenennen fehlgeschlagen.');
    },
  });

  const bulkSubjectMutation = useMutation({
    mutationFn: async ({ ids, subject }: { ids: string[]; subject: string }) => {
      await Promise.all(ids.map((id) => api.patch(`/worksheets/${id}/`, { subject })));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      setFolderMenu(null);
      setDeleteErr('');
    },
    onError: () => {
      setDeleteErr('Ordneraktion fehlgeschlagen.');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (wid: string) =>
      api.post(`/worksheets/${wid}/duplicate/`).then((r) => r.data as { id: string }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      setWorksheetMenu(null);
      setDeleteErr('');
      addPendingFirstOpenWorksheet(data.id);
      setPendingFirstOpenIds([...getPendingFirstOpenWorksheetIds()]);
      navigate('/app/worksheets', { replace: true });
    },
    onError: () => {
      setDeleteErr('Duplizieren fehlgeschlagen.');
    },
  });

  const handleRenameWorksheet = (item: ListItem) => {
    const current = item.title ?? '';
    const next = window.prompt('Neuer Titel', current);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    if (trimmed === current.trim()) return;
    renameMutation.mutate({ id: item.id, title: trimmed });
  };

  const openWorksheetMenu = (e: ReactMouseEvent, worksheetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderMenu(null);
    setWorksheetMenu({ x: e.clientX, y: e.clientY, worksheetId });
  };

  const openFolderMenu = (e: ReactMouseEvent, subjectKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setWorksheetMenu(null);
    setFolderMenu({ x: e.clientX, y: e.clientY, subjectKey });
  };

  const closeWorksheetMenu = useCallback(() => setWorksheetMenu(null), []);
  const closeFolderMenu = useCallback(() => setFolderMenu(null), []);

  const worksheetIdsInSubjectFolder = useCallback(
    (subjectKey: string) =>
      items.filter((w) => (w.subject || '').trim() === subjectKey).map((w) => w.id),
    [items],
  );

  const handleRenameSubjectFolder = (subjectKey: string) => {
    const ids = worksheetIdsInSubjectFolder(subjectKey);
    if (ids.length === 0) return;
    const next = window.prompt('Neuer Ordnername', subjectKey);
    if (next === null) return;
    const trimmed = next.trim().slice(0, WORKSHEET_SUBJECT_MAX_LEN);
    if (!trimmed || trimmed === subjectKey) return;
    bulkSubjectMutation.mutate({ ids, subject: trimmed });
  };

  const handleNewSubjectSubfolder = (subjectKey: string) => {
    const child = window.prompt('Name des Unterordners', '');
    if (child === null) return;
    const trimmedChild = child.trim();
    if (!trimmedChild) return;
    let combined = `${subjectKey} / ${trimmedChild}`;
    if (combined.length > WORKSHEET_SUBJECT_MAX_LEN) {
      combined = combined.slice(0, WORKSHEET_SUBJECT_MAX_LEN);
    }
    navigate(`/app/create?subject=${encodeURIComponent(combined)}`);
  };

  const handleDeleteSubjectFolder = (subjectKey: string) => {
    const ids = worksheetIdsInSubjectFolder(subjectKey);
    const count = ids.length;
    const parts = [
      `Ordner „${subjectKey}" wirklich löschen?`,
      '',
      'Alle Arbeitsblätter in diesem Ordner verlieren die Fachzuordnung und erscheinen wieder unter „Ohne Ordner".',
      '',
      count > 0 ? `Betroffene Arbeitsblätter: ${count}.` : 'In diesem Ordner sind derzeit keine Blätter.',
      '',
      'Fortfahren?',
    ];
    if (!window.confirm(parts.join('\n'))) return;
    bulkSubjectMutation.mutate({ ids, subject: '' });
  };

  const errMessage = isError ? 'Liste konnte nicht geladen werden.' : deleteErr;

  const renderWorksheetRow = (w: ListItem, highlightFirstOpen = false) => {
    const titleLabel = w.title || 'Ohne Titel';
    const active = selectedId === w.id;
    const metaBits: string[] = [];
    if (w.grade != null) metaBits.push(`Kl. ${w.grade}`);
    metaBits.push(formatDate(w.updated_at as string));
    const meta = metaBits.join(' · ');
    return (
      <div
        key={w.id}
        className={cn(
          'group/row flex max-w-full items-center gap-0.5 rounded-lg pr-0.5 transition-colors',
          active ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-slate-50',
          highlightFirstOpen && !active && 'bg-emerald-50 ring-1 ring-emerald-200/90',
        )}
        onContextMenu={(e) => openWorksheetMenu(e, w.id)}
      >
        <div className="min-w-0 flex-1">
          <NavLink
            to={w.id}
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-lg py-1.5 pr-1 pl-1 text-left text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
              active ? 'font-medium' : 'font-normal text-slate-800',
            )}
            title={titleLabel}
            onContextMenu={(e) => openWorksheetMenu(e, w.id)}
          >
            <FileText
              size={14}
              className={cn('shrink-0', active ? 'text-indigo-600' : 'text-slate-400')}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{titleLabel}</span>
            <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">{meta}</span>
          </NavLink>
        </div>
        <IconButton
          variant="danger"
          size="sm"
          className="shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/row:opacity-100 focus-visible:opacity-100"
          aria-label={`„${titleLabel}“ löschen`}
          title="Löschen"
          disabled={deleting === w.id}
          onClick={(e) => {
            e.preventDefault();
            void handleDelete(w.id, titleLabel);
          }}
          onContextMenu={(e) => openWorksheetMenu(e, w.id)}
        >
          <Trash2 size={12} aria-hidden />
        </IconButton>
      </div>
    );
  };

  return (
    <>
      <WorkspaceExplorerFrame
        mobileTab={mobileTab}
        onMobileTabChange={setMobileTab}
        contentDisabled={!selectedId}
        isLg={isLg}
        sidebar={
        <>
          <WorkspaceExplorerToolbar>
            <IconButton
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              disabled
              aria-label="Ordner (in Kürze)"
              title="Eigene Ordner für Arbeitsblätter folgen."
            >
              <FolderPlus size={18} aria-hidden />
            </IconButton>
            <Button
              as="link"
              to="/app/create"
              size="sm"
              leftIcon={<Plus size={14} aria-hidden />}
              className="shrink-0"
            >
              Neu
            </Button>
            <SearchInput
              placeholder="Titel, Fach, Klasse …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Arbeitsblätter durchsuchen"
              containerClassName="min-w-0 flex-1 basis-[min(100%,12rem)] sm:basis-auto"
            />
          </WorkspaceExplorerToolbar>

          {errMessage ? (
            <div className="shrink-0 p-2">
              <Alert tone="error">{errMessage}</Alert>
            </div>
          ) : null}

          <WorkspaceExplorerListScroll>
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
                <WorkspaceExplorerGalerieHint
                  hint={
                    <>
                      Blätter ohne Eintrag im Feld <span className="font-semibold text-slate-500">Fach</span> erscheinen
                      unter „Ohne Ordner“. Weitere Blätter sind nach Fach gruppiert — Rechtsklick auf einen Fach-Ordner
                      für Umbenennen, Unterordner (neues Fach) oder Ordner auflösen; Rechtsklick auf ein Blatt für
                      Titel, Duplikat und Löschen.
                    </>
                  }
                />

                {filteredItems.length === 0 ? (
                  <p className="px-2 text-sm text-slate-500">Keine Treffer — Suche anpassen.</p>
                ) : (
                  <ul className="space-y-0.5">
                    <li className="select-none">
                      <div className="flex w-full max-w-full items-stretch gap-0.5">
                        <button
                          type="button"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-400"
                          aria-expanded={!ungroupedCollapsed}
                          aria-label={ungroupedCollapsed ? '„Ohne Ordner“ ausklappen' : '„Ohne Ordner“ einklappen'}
                          onClick={() => setUngroupedCollapsed((c) => !c)}
                        >
                          <ChevronDown
                            className={cn('h-4 w-4 transition-transform duration-150', ungroupedCollapsed && '-rotate-90')}
                            aria-hidden
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setUngroupedCollapsed((c) => !c)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 pr-1.5 pl-0.5 text-left text-[13px] text-slate-800 transition-colors hover:bg-slate-50"
                        >
                          <FolderIcon size={14} className="shrink-0 text-slate-400" aria-hidden />
                          <span className="min-w-0 flex-1 truncate font-medium">Ohne Ordner</span>
                          <span className="shrink-0 tabular-nums text-[11px] text-slate-400">{ungroupedItems.length}</span>
                        </button>
                      </div>
                      {!ungroupedCollapsed ? (
                        <div className="mt-1 space-y-0.5 pb-2 pl-[0.875rem]">
                          {ungroupedItems.map((w) =>
                            renderWorksheetRow(w, pendingFirstOpenIds.includes(w.id)),
                          )}
                        </div>
                      ) : null}
                    </li>

                    {folderKeys.length > 0 ? <WorkspaceExplorerSectionRule /> : null}

                    {folderKeys.map((subjectKey) => {
                      const rows = subjectGrouped.get(subjectKey) ?? [];
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
                              onContextMenu={(e) => openFolderMenu(e, subjectKey)}
                              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 pr-1.5 pl-0.5 text-left text-[13px] text-slate-800 transition-colors hover:bg-slate-50"
                            >
                              <FolderIcon size={14} className="shrink-0 text-slate-500" aria-hidden />
                              <span className="min-w-0 flex-1 truncate font-medium">{subjectKey}</span>
                              <span className="shrink-0 tabular-nums text-[11px] text-slate-400">{rows.length}</span>
                            </button>
                          </div>
                          {!collapsed ? (
                            <ul className="mt-0.5 space-y-0.5 border-l border-slate-100 pl-1.5 ml-[0.875rem]">
                              {rows.map((w) => (
                                <li key={w.id}>
                                  {renderWorksheetRow(w, pendingFirstOpenIds.includes(w.id))}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </WorkspaceExplorerListScroll>
        </>
      }
    >
      <Outlet />
    </WorkspaceExplorerFrame>
      {folderMenu ? (
        <ExplorerFolderContextMenuPortal
          coords={{ x: folderMenu.x, y: folderMenu.y }}
          onClose={closeFolderMenu}
          onRename={() => {
            const key = folderMenu.subjectKey;
            closeFolderMenu();
            handleRenameSubjectFolder(key);
          }}
          onNewSubfolder={() => {
            const key = folderMenu.subjectKey;
            closeFolderMenu();
            handleNewSubjectSubfolder(key);
          }}
          onDelete={() => {
            const key = folderMenu.subjectKey;
            closeFolderMenu();
            handleDeleteSubjectFolder(key);
          }}
        />
      ) : null}
      {worksheetMenu && worksheetMenuTarget ? (
        <ExplorerListItemContextMenuPortal
          coords={{ x: worksheetMenu.x, y: worksheetMenu.y }}
          itemLabel={worksheetMenuTarget.title ?? ''}
          onClose={closeWorksheetMenu}
          duplicatePending={duplicateMutation.isPending}
          renamePending={renameMutation.isPending}
          deletePending={deleting !== null}
          deleteLabel="Arbeitsblatt löschen …"
          onRename={() => {
            closeWorksheetMenu();
            handleRenameWorksheet(worksheetMenuTarget);
          }}
          onDuplicate={() => duplicateMutation.mutate(worksheetMenuTarget.id)}
          onDelete={() => {
            closeWorksheetMenu();
            void handleDelete(worksheetMenuTarget.id, worksheetMenuTarget.title || 'Ohne Titel');
          }}
        />
      ) : null}
    </>
  );
}

export function WorksheetPageOutlet() {
  const { id } = useParams();
  return <WorksheetPage key={id} />;
}

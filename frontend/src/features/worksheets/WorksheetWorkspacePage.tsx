import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { NavLink, Outlet, matchPath, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  addPendingFirstOpenWorksheet,
  getPendingFirstOpenWorksheetIds,
} from './lib/worksheetFirstOpenHighlight';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, FileText, Folder as FolderIcon, FolderPlus, GripVertical, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import {
  WORKSHEET_LIST_QUERY_KEY,
  WORKSHEET_LIST_STALE_MS,
  WORKSHEETS_FOLDERS_QUERY_KEY,
  fetchWorksheetList,
} from '../../lib/listQueries';
import {
  createWorksheetFolder,
  deleteWorksheetFolder,
  fetchWorksheetFolders,
  updateWorksheetFolder,
  type WorksheetFolderDto,
} from './worksheetsApi';
import { formatDate } from '../../lib/formatDate';
import { Alert, Button, EmptyState, IconButton, SearchInput } from '../../components/ui';
import { cn } from '../../lib/cn';
import { LG_MEDIA_QUERY, useMediaQuery } from '../../lib/useMediaQuery';
import type { WorkspaceMobileTab } from '../../components/shell/MobileWorkspaceTabs';
import {
  WorkspaceExplorerFrame,
  WorkspaceExplorerGalerieHint,
  WorkspaceExplorerListScroll,
  WorkspaceExplorerToolbar,
} from '../../components/workspace/WorkspaceExplorer';
import { ExplorerListItemContextMenuPortal } from '../../components/workspace/ExplorerListItemContextMenu';
import { ExplorerFolderContextMenuPortal } from '../../components/workspace/ExplorerFolderContextMenu';
import { WorksheetPage } from './WorksheetPage';

const DND_WORKSHEET_MIME = 'application/x-worksheet-ai-worksheet-id';

type FolderMenuState = { x: number; y: number; folderId: string };
type WorksheetMenuState = { x: number; y: number; worksheetId: string };

type ListItem = {
  id: string;
  title: string;
  subject: string;
  grade: number | null;
  topic?: string;
  status?: string;
  updated_at?: string;
  folder?: { id: string; path: string } | null;
  render_model?: { subtitle?: string } | null;
};

const DEFAULT_NEW_FOLDER_NAME = 'Neuer Ordner';

function uniqueSiblingFolderName(existing: Set<string>, base = DEFAULT_NEW_FOLDER_NAME): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

function countDescendantSubfolders(rootId: string, folderList: WorksheetFolderDto[]): number {
  let total = 0;
  for (const f of folderList) {
    if (f.parent === rootId) {
      total += 1 + countDescendantSubfolders(f.id, folderList);
    }
  }
  return total;
}

function setWorksheetDragGhost(dt: DataTransfer | null, title: string) {
  if (!dt) return;
  const ghost = document.createElement('div');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:2147483647',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'max-width:280px',
    'padding:10px 14px',
    'border-radius:12px',
    'background:#ffffff',
    'border:1px solid #a5b4fc',
    'box-shadow:0 12px 40px -8px rgba(79,70,229,0.35),0 4px 14px rgba(15,23,42,0.12)',
    'pointer-events:none',
    'font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
  ].join(';');
  const badge = document.createElement('span');
  badge.textContent = 'A';
  badge.style.cssText =
    'flex-shrink:0;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#4f46e5;color:#fff;font-size:11px;font-weight:800;';
  const label = document.createElement('span');
  label.textContent = title.trim() || 'Ohne Titel';
  label.style.cssText =
    'min-width:0;flex:1;font-size:13px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  ghost.appendChild(badge);
  ghost.appendChild(label);
  document.body.appendChild(ghost);
  const w = ghost.offsetWidth;
  const h = ghost.offsetHeight;
  dt.setDragImage(ghost, Math.round(Math.min(56, w * 0.28)), Math.round(h / 2));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => ghost.remove());
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

  const { data: folders = [] } = useQuery({
    queryKey: WORKSHEETS_FOLDERS_QUERY_KEY,
    queryFn: fetchWorksheetFolders,
    staleTime: WORKSHEET_LIST_STALE_MS,
  });

  const [query, setQuery] = useState('');
  const [worksheetMenu, setWorksheetMenu] = useState<WorksheetMenuState | null>(null);
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState('');
  const folderCollapseInitRef = useRef(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);
  const [dropTarget, setDropTarget] = useState<'ungrouped' | string | null>(null);
  const [draggingWorksheetId, setDraggingWorksheetId] = useState<string | null>(null);
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

  useLayoutEffect(() => {
    if (folders.length === 0) {
      folderCollapseInitRef.current = false;
      return;
    }
    if (folderCollapseInitRef.current) return;
    folderCollapseInitRef.current = true;
    setCollapsedFolderIds(new Set(folders.map((f) => f.id)));
  }, [folders]);

  useEffect(() => {
    const onWinDragEnd = () => {
      setDraggingWorksheetId(null);
      setDropTarget(null);
    };
    window.addEventListener('dragend', onWinDragEnd, true);
    return () => window.removeEventListener('dragend', onWinDragEnd, true);
  }, []);

  const foldersByParent = useMemo(() => {
    const m = new Map<string | null, WorksheetFolderDto[]>();
    for (const f of folders) {
      const k = f.parent ?? null;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.path.localeCompare(b.path, 'de'));
    }
    return m;
  }, [folders]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((w) => {
      const rmSub = String(w.render_model?.subtitle ?? '').toLowerCase();
      return (
        w.title?.toLowerCase().includes(q) ||
        w.subject?.toLowerCase().includes(q) ||
        w.topic?.toLowerCase().includes(q) ||
        rmSub.includes(q) ||
        String(w.grade ?? '').includes(q) ||
        (w.folder?.path ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  const subtreeWorksheetCountByFolder = useMemo(() => {
    const direct = new Map<string, number>();
    for (const w of items) {
      const id = w.folder?.id;
      if (!id) continue;
      direct.set(id, (direct.get(id) ?? 0) + 1);
    }
    const childIdsByParent = new Map<string, string[]>();
    for (const f of folders) {
      const p = f.parent;
      if (p == null) continue;
      if (!childIdsByParent.has(p)) childIdsByParent.set(p, []);
      childIdsByParent.get(p)!.push(f.id);
    }
    const out = new Map<string, number>();
    const aggregate = (id: string): number => {
      if (out.has(id)) return out.get(id)!;
      let n = direct.get(id) ?? 0;
      for (const cid of childIdsByParent.get(id) ?? []) {
        n += aggregate(cid);
      }
      out.set(id, n);
      return n;
    };
    for (const f of folders) aggregate(f.id);
    return out;
  }, [items, folders]);

  const subtreeFilteredWorksheetCountByFolder = useMemo(() => {
    const direct = new Map<string, number>();
    for (const w of filteredItems) {
      const id = w.folder?.id;
      if (!id) continue;
      direct.set(id, (direct.get(id) ?? 0) + 1);
    }
    const childIdsByParent = new Map<string, string[]>();
    for (const f of folders) {
      const p = f.parent;
      if (p == null) continue;
      if (!childIdsByParent.has(p)) childIdsByParent.set(p, []);
      childIdsByParent.get(p)!.push(f.id);
    }
    const out = new Map<string, number>();
    const aggregate = (id: string): number => {
      if (out.has(id)) return out.get(id)!;
      let n = direct.get(id) ?? 0;
      for (const cid of childIdsByParent.get(id) ?? []) {
        n += aggregate(cid);
      }
      out.set(id, n);
      return n;
    };
    for (const f of folders) aggregate(f.id);
    return out;
  }, [filteredItems, folders]);

  const directWorksheetsByFolderId = useMemo(() => {
    const m = new Map<string, ListItem[]>();
    for (const w of filteredItems) {
      const fid = w.folder?.id;
      if (!fid) continue;
      if (!m.has(fid)) m.set(fid, []);
      m.get(fid)!.push(w);
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

  const ungroupedWorksheets = useMemo(() => {
    const list = filteredItems.filter((w) => !w.folder?.id);
    return [...list].sort((a, b) => {
      const tb = new Date(String(b.updated_at ?? 0)).getTime();
      const ta = new Date(String(a.updated_at ?? 0)).getTime();
      if (tb !== ta) return tb - ta;
      return (a.title || '').localeCompare(b.title || '', 'de');
    });
  }, [filteredItems]);

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
    onError: () => setDeleteErr('Umbenennen fehlgeschlagen.'),
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
    onError: () => setDeleteErr('Duplizieren fehlgeschlagen.'),
  });

  const createFolderMutation = useMutation({
    mutationFn: (payload: { name: string; parent?: string | null }) => createWorksheetFolder(payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: WORKSHEETS_FOLDERS_QUERY_KEY });
      const parentId = created.parent;
      if (parentId != null) {
        setCollapsedFolderIds((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => deleteWorksheetFolder(folderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WORKSHEETS_FOLDERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id: fid, name }: { id: string; name: string }) =>
      updateWorksheetFolder(fid, { name }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: WORKSHEETS_FOLDERS_QUERY_KEY }),
  });

  const moveWorksheetMutation = useMutation({
    mutationFn: ({ worksheetId, folderId }: { worksheetId: string; folderId: string | null }) =>
      api.patch(`/worksheets/${worksheetId}/`, { folder_id: folderId }).then((r) => r.data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY }),
  });

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

  const handleRenameWorksheet = (item: ListItem) => {
    const current = item.title ?? '';
    const next = window.prompt('Neuer Titel', current);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === current.trim()) return;
    renameMutation.mutate({ id: item.id, title: trimmed });
  };

  const handleCreateRootFolder = () => {
    const siblingNames = new Set(folders.filter((f) => f.parent == null).map((f) => f.name));
    const name = uniqueSiblingFolderName(siblingNames);
    createFolderMutation.mutate({ name, parent: null });
  };

  const toggleFolderCollapsed = useCallback((folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const openFolderMenu = (e: ReactMouseEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setWorksheetMenu(null);
    setFolderMenu({ x: e.clientX, y: e.clientY, folderId });
  };

  const openWorksheetMenu = (e: ReactMouseEvent, worksheetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderMenu(null);
    setWorksheetMenu({ x: e.clientX, y: e.clientY, worksheetId });
  };

  const closeFolderMenu = useCallback(() => setFolderMenu(null), []);
  const closeWorksheetMenu = useCallback(() => setWorksheetMenu(null), []);

  const handleRenameFolder = (folderId: string) => {
    const f = folders.find((x) => x.id === folderId);
    const next = window.prompt('Neuer Ordnername', f?.name ?? '');
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === f?.name) return;
    renameFolderMutation.mutate({ id: folderId, name: trimmed });
  };

  const handleNewSubfolder = (parentId: string) => {
    const siblingNames = new Set(folders.filter((fc) => fc.parent === parentId).map((fc) => fc.name));
    const name = uniqueSiblingFolderName(siblingNames);
    createFolderMutation.mutate({ name, parent: parentId });
  };

  const handleDeleteFolderFromMenu = (folderId: string) => {
    const label = folders.find((x) => x.id === folderId)?.path ?? 'Ordner';
    const sheetTotal = subtreeWorksheetCountByFolder.get(folderId) ?? 0;
    const subfolderTotal = countDescendantSubfolders(folderId, folders);
    const parts = [
      `Ordner „${label}" wirklich löschen?`,
      '',
      'Alle Arbeitsblätter in diesem Ordner und in allen Unterordnern verlieren die Ordnerzuordnung und erscheinen wieder unter „Ohne Ordner".',
    ];
    if (subfolderTotal > 0) {
      parts.push(
        `${subfolderTotal} Unterordner ${subfolderTotal === 1 ? 'wird' : 'werden'} mit entfernt — die Ordnerstruktur darunter wird aufgelöst.`,
      );
    }
    parts.push(
      '',
      sheetTotal > 0
        ? `Betroffene Arbeitsblätter (Summe inkl. Unterordner): ${sheetTotal}.`
        : 'In diesem Teil der Galerie sind derzeit keine Blätter zugeordnet.',
      '',
      'Fortfahren?',
    );
    if (!window.confirm(parts.join('\n'))) return;
    deleteFolderMutation.mutate(folderId);
  };

  const onExplorerDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const dragLeaveUnlessChild = (e: DragEvent<Element>, targetKey: 'ungrouped' | string) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDropTarget((t) => (t === targetKey ? null : t));
  };

  const parseDropWorksheetId = (e: DragEvent) =>
    e.dataTransfer.getData(DND_WORKSHEET_MIME) || e.dataTransfer.getData('text/plain');

  const handleAssignDrop = (e: DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDropTarget(null);
    setDraggingWorksheetId(null);
    const id = parseDropWorksheetId(e).trim();
    if (!id) return;
    moveWorksheetMutation.mutate({ worksheetId: id, folderId });
  };

  const onWorksheetDragStart = (e: DragEvent<HTMLButtonElement>, worksheetId: string, title: string) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.setData(DND_WORKSHEET_MIME, worksheetId);
    dt.effectAllowed = 'move';
    setDraggingWorksheetId(worksheetId);
    setWorksheetDragGhost(dt, title);
  };

  const onWorksheetDragEnd = useCallback(() => {
    setDraggingWorksheetId(null);
    setDropTarget(null);
  }, []);

  const qActive = query.trim().length > 0;

  const showListError = isError ? 'Liste konnte nicht geladen werden.' : '';
  const errMessage = deleteErr || showListError;

  const renderWorksheetRow = (w: ListItem, depthPx: number, highlightFirstOpen = false) => {
    const active = selectedId === w.id;
    const titleLabel = w.title || 'Ohne Titel';
    const isDraggingThis = draggingWorksheetId === w.id;
    const metaBits: string[] = [];
    if (w.grade != null) metaBits.push(`Kl. ${w.grade}`);
    metaBits.push(formatDate(w.updated_at as string));
    const meta = metaBits.join(' · ');
    return (
      <div
        key={w.id}
        style={{ paddingLeft: `${depthPx}px` }}
        className={cn(
          'group/row flex max-w-full items-center gap-0.5 rounded-lg pr-0.5 transition-[opacity,transform,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
          active ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-slate-50',
          highlightFirstOpen && !active && 'bg-emerald-50 ring-1 ring-emerald-200/90',
          isDraggingThis && 'opacity-[0.42] scale-[0.985] bg-indigo-50/50 ring-1 ring-dashed ring-indigo-300/70',
        )}
        onContextMenu={(e) => openWorksheetMenu(e, w.id)}
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => onWorksheetDragStart(e, w.id, titleLabel)}
          onDragEnd={onWorksheetDragEnd}
          className={cn(
            'inline-flex shrink-0 cursor-grab touch-none rounded-md p-0.5 outline-none',
            'text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing',
            'focus-visible:ring-2 focus-visible:ring-indigo-400',
          )}
          aria-label={`„${titleLabel}" zum Ordner verschieben`}
          title="Zum Sortieren ziehen"
          onClick={(ev) => ev.preventDefault()}
        >
          <GripVertical size={14} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <NavLink
            to={w.id}
            draggable={false}
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
        sidebarDragging={draggingWorksheetId != null}
        sidebar={
          <>
            <WorkspaceExplorerToolbar>
              <IconButton
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={createFolderMutation.isPending}
                aria-label="Neuen Ordner auf oberster Ebene anlegen"
                title="Neuer Ordner"
                onClick={handleCreateRootFolder}
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
                placeholder="Titel, Fach, Thema, Ordnerpfad …"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Arbeitsblätter durchsuchen"
                containerClassName="min-w-0 flex-1 basis-[min(100%,12rem)] sm:basis-auto"
              />
            </WorkspaceExplorerToolbar>

            {createFolderMutation.isError && (
              <div className="shrink-0 px-2">
                <Alert tone="error">
                  {(createFolderMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
                    'Ordner konnte nicht angelegt werden.'}
                </Alert>
              </div>
            )}
            {deleteFolderMutation.isError && (
              <div className="shrink-0 px-2">
                <Alert tone="error">
                  {(deleteFolderMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
                    'Ordner konnte nicht gelöscht werden.'}
                </Alert>
              </div>
            )}
            {moveWorksheetMutation.isError && (
              <div className="shrink-0 px-2">
                <Alert tone="error">Verschieben in den Ordner ist fehlgeschlagen.</Alert>
              </div>
            )}
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
                        Das Feld <span className="font-semibold text-slate-500">Fach</span> ist nur Metadaten — die linke
                        Galerie strukturieren <span className="font-semibold text-slate-500">eigene Ordner</span>. Rechtsklick
                        auf einen Ordner: Umbenennen, Unterordner, löschen. Zum Zuordnen das{' '}
                        <span className="font-semibold text-slate-500">Griff-Symbol</span> am Blatt greifen und auf einen
                        Ordner (oder „Ohne Ordner“) ziehen. Neu übernommen oder duplizierte Blätter sind grün hinterlegt, bis du
                        sie einmal zur Bearbeitung geöffnet hast.
                      </>
                    }
                  />

                  {filteredItems.length === 0 ? (
                    <p className="px-2 text-sm text-slate-500">Keine Treffer — Suche anpassen.</p>
                  ) : (
                    <>
                      <motion.div
                        initial={false}
                        animate={{
                          scale: draggingWorksheetId != null && dropTarget === 'ungrouped' ? 1.02 : 1,
                        }}
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        onDragOver={(e) => {
                          onExplorerDragOver(e);
                          setDropTarget('ungrouped');
                        }}
                        onDragLeave={(e) => dragLeaveUnlessChild(e, 'ungrouped')}
                        onDrop={(e) => handleAssignDrop(e, null)}
                        className={cn(
                          'rounded-xl px-0.5 transition-colors duration-200',
                          draggingWorksheetId != null &&
                            dropTarget === 'ungrouped' &&
                            'bg-indigo-50/90 shadow-[0_0_0_2px_theme(colors.indigo.500),0_12px_28px_-8px_rgba(79,70,229,0.35)]',
                        )}
                      >
                        <div className="flex w-full max-w-full items-stretch gap-0.5">
                          <button
                            type="button"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-400"
                            aria-expanded={!ungroupedCollapsed}
                            aria-label={ungroupedCollapsed ? '„Ohne Ordner“ ausklappen' : '„Ohne Ordner“ einklappen'}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setUngroupedCollapsed((c) => !c);
                            }}
                          >
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition-transform duration-150',
                                ungroupedCollapsed && '-rotate-90',
                              )}
                              aria-hidden
                            />
                          </button>
                          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 pr-2 pl-0.5 text-left text-[13px] text-slate-800">
                            <FolderIcon size={14} className="shrink-0 text-slate-400" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">Ohne Ordner</span>
                            <span
                              className="shrink-0 tabular-nums text-[11px] text-slate-400"
                              title="Arbeitsblätter ohne Ordnerzuordnung (gefiltert)"
                            >
                              {ungroupedWorksheets.length}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                      {!ungroupedCollapsed ? (
                        <div className="mt-1 space-y-0.5 pb-2">
                          {ungroupedWorksheets.map((w) =>
                            renderWorksheetRow(w, 20, pendingFirstOpenIds.includes(w.id)),
                          )}
                        </div>
                      ) : null}

                      <div className="my-2 border-t border-slate-100" />

                      <WsFolderBranch
                        parentId={null}
                        depth={0}
                        foldersByParent={foldersByParent}
                        subtreeSheetCountByFolder={subtreeWorksheetCountByFolder}
                        subtreeFilteredSheetCountByFolder={subtreeFilteredWorksheetCountByFolder}
                        collapsedFolderIds={collapsedFolderIds}
                        toggleFolderCollapsed={toggleFolderCollapsed}
                        dropTarget={dropTarget}
                        setDropTarget={setDropTarget}
                        draggingWorksheetId={draggingWorksheetId}
                        onExplorerDragOver={onExplorerDragOver}
                        onFolderContextMenu={openFolderMenu}
                        onAssignDrop={handleAssignDrop}
                        dragLeaveUnlessChild={dragLeaveUnlessChild}
                        directWorksheetsByFolderId={directWorksheetsByFolderId}
                        queryActive={qActive}
                        pendingFirstOpenIds={pendingFirstOpenIds}
                        renderWorksheetRow={renderWorksheetRow}
                      />
                    </>
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
            const id = folderMenu.folderId;
            closeFolderMenu();
            handleRenameFolder(id);
          }}
          onNewSubfolder={() => {
            const id = folderMenu.folderId;
            closeFolderMenu();
            handleNewSubfolder(id);
          }}
          onDelete={() => {
            const id = folderMenu.folderId;
            closeFolderMenu();
            handleDeleteFolderFromMenu(id);
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

const WsFolderBranch = ({
  parentId,
  depth,
  foldersByParent,
  subtreeSheetCountByFolder,
  subtreeFilteredSheetCountByFolder,
  collapsedFolderIds,
  toggleFolderCollapsed,
  dropTarget,
  setDropTarget,
  draggingWorksheetId,
  onExplorerDragOver,
  dragLeaveUnlessChild,
  onFolderContextMenu,
  onAssignDrop,
  directWorksheetsByFolderId,
  queryActive,
  pendingFirstOpenIds,
  renderWorksheetRow,
}: {
  parentId: string | null;
  depth: number;
  foldersByParent: Map<string | null, WorksheetFolderDto[]>;
  subtreeSheetCountByFolder: Map<string, number>;
  subtreeFilteredSheetCountByFolder: Map<string, number>;
  collapsedFolderIds: Set<string>;
  toggleFolderCollapsed: (folderId: string) => void;
  dropTarget: string | null;
  setDropTarget: Dispatch<SetStateAction<'ungrouped' | string | null>>;
  draggingWorksheetId: string | null;
  onExplorerDragOver: (e: DragEvent) => void;
  dragLeaveUnlessChild: (e: DragEvent, targetKey: 'ungrouped' | string) => void;
  onFolderContextMenu: (e: ReactMouseEvent, folderId: string) => void;
  onAssignDrop: (e: DragEvent, folderId: string | null) => void;
  directWorksheetsByFolderId: Map<string, ListItem[]>;
  queryActive: boolean;
  pendingFirstOpenIds: string[];
  renderWorksheetRow: (w: ListItem, depthPx: number, highlightFirstOpen?: boolean) => ReactNode;
}) => {
  const rawList = foldersByParent.get(parentId) ?? [];
  const list = queryActive
    ? rawList.filter((f) => (subtreeFilteredSheetCountByFolder.get(f.id) ?? 0) > 0)
    : rawList;
  if (list.length === 0) return null;
  return (
    <>
      {list.map((f) => {
        const children = foldersByParent.get(f.id) ?? [];
        const hasChildFolders = children.length > 0;
        const isCollapsed = collapsedFolderIds.has(f.id);
        const sheetTotal = subtreeSheetCountByFolder.get(f.id) ?? 0;
        const worksheetsHere = directWorksheetsByFolderId.get(f.id) ?? [];
        const worksheetIndent = 8 + (depth + 1) * 12;
        return (
          <div key={f.id}>
            <motion.div
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              initial={false}
              animate={{
                scale: draggingWorksheetId != null && dropTarget === f.id ? 1.02 : 1,
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              onDragOver={(e) => {
                onExplorerDragOver(e);
                setDropTarget(f.id);
              }}
              onDragLeave={(e) => dragLeaveUnlessChild(e, f.id)}
              onDrop={(e) => onAssignDrop(e, f.id)}
              className={cn(
                'rounded-xl transition-colors duration-200',
                draggingWorksheetId != null &&
                  dropTarget === f.id &&
                  'bg-indigo-50/90 shadow-[0_0_0_2px_theme(colors.indigo.500),0_12px_28px_-8px_rgba(79,70,229,0.35)]',
              )}
            >
              <div className="flex w-full max-w-full items-stretch gap-0.5">
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-400"
                  aria-label={
                    hasChildFolders || worksheetsHere.length > 0
                      ? isCollapsed
                        ? 'Inhalt anzeigen'
                        : 'Inhalt ausblenden'
                      : isCollapsed
                        ? 'Ordner aufklappen'
                        : 'Ordner zuklappen'
                  }
                  aria-expanded={!isCollapsed}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFolderCollapsed(f.id);
                  }}
                >
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform duration-150', isCollapsed && '-rotate-90')}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => toggleFolderCollapsed(f.id)}
                  onContextMenu={(e) => onFolderContextMenu(e, f.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 pr-1.5 pl-0.5 text-left text-[13px] text-slate-800 transition-colors hover:bg-slate-50"
                >
                  <FolderIcon size={14} className="shrink-0 text-slate-500" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span
                    className="shrink-0 tabular-nums text-[11px] text-slate-400"
                    title="Arbeitsblätter in diesem Ordner inkl. Unterordner"
                  >
                    {sheetTotal}
                  </span>
                </button>
              </div>
            </motion.div>
            {!isCollapsed ? (
              <>
                <WsFolderBranch
                  parentId={f.id}
                  depth={depth + 1}
                  foldersByParent={foldersByParent}
                  subtreeSheetCountByFolder={subtreeSheetCountByFolder}
                  subtreeFilteredSheetCountByFolder={subtreeFilteredSheetCountByFolder}
                  collapsedFolderIds={collapsedFolderIds}
                  toggleFolderCollapsed={toggleFolderCollapsed}
                  dropTarget={dropTarget}
                  setDropTarget={setDropTarget}
                  draggingWorksheetId={draggingWorksheetId}
                  onExplorerDragOver={onExplorerDragOver}
                  dragLeaveUnlessChild={dragLeaveUnlessChild}
                  onFolderContextMenu={onFolderContextMenu}
                  onAssignDrop={onAssignDrop}
                  directWorksheetsByFolderId={directWorksheetsByFolderId}
                  queryActive={queryActive}
                  pendingFirstOpenIds={pendingFirstOpenIds}
                  renderWorksheetRow={renderWorksheetRow}
                />
                {worksheetsHere.length > 0 ? (
                  <div className="mt-0.5 space-y-0.5">
                    {worksheetsHere.map((w) =>
                      renderWorksheetRow(w, worksheetIndent, pendingFirstOpenIds.includes(w.id)),
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
};

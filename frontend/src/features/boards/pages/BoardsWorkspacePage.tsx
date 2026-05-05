import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { matchPath, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  Folder as FolderIcon,
  FolderPlus,
  GripVertical,
  Plus,
  Presentation,
  Trash2,
} from 'lucide-react';
import { Alert, Button, EmptyState, IconButton, SearchInput } from '../../../components/ui';
import {
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_FOLDERS_QUERY_KEY,
  BOARDS_LIBRARY_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
} from '../../../lib/listQueries';
import {
  createBoardFolder,
  deleteBoard,
  deleteBoardFolder,
  duplicateBoard,
  fetchBoardFolders,
  fetchBoards,
  updateBoardCode,
  updateBoardFolder,
} from '../boardsApi';
import { cn } from '../../../lib/cn';
import type { BoardFolderDto, BoardListItem } from '../types';
import { BoardDetailPage } from './BoardDetailPage';
import { NewBoardModal } from '../components/NewBoardModal';
import { getPendingFirstOpenBoardIds, addPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';

const DND_BOARD_MIME = 'application/x-worksheet-board-id';

type FolderMenuState = { x: number; y: number; folderId: string };
type BoardMenuState = { x: number; y: number; boardId: string };

const DEFAULT_NEW_FOLDER_NAME = 'Neuer Ordner';

function uniqueSiblingFolderName(existing: Set<string>, base = DEFAULT_NEW_FOLDER_NAME): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

function countDescendantSubfolders(rootId: string, folderList: BoardFolderDto[]): number {
  let total = 0;
  for (const f of folderList) {
    if (f.parent === rootId) {
      total += 1 + countDescendantSubfolders(f.id, folderList);
    }
  }
  return total;
}

function setBoardDragGhost(dt: DataTransfer | null, title: string) {
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
  badge.textContent = 'T';
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

export function BoardExplorerPlaceholder() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 bg-[var(--color-bg-app)] p-8 text-center lg:min-h-0">
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-8 py-10 shadow-sm">
        <Presentation className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden />
        <p className="text-sm font-semibold text-slate-800">Tafelbild auswählen</p>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
          Klicke links auf ein Tafelbild oder nutze den Rechtsklick für dieselben Optionen wie in der Ansicht oben
          (Vorschau, Bibliothek, Schüler-Link, Duplizieren, Löschen).
        </p>
      </div>
    </div>
  );
}

export function BoardDetailPageOutlet() {
  const { id } = useParams();
  if (!id) {
    return (
      <div className="flex min-h-[12rem] flex-1 items-center justify-center text-sm text-slate-500 lg:min-h-0">
        Tafelbild wird geladen …
      </div>
    );
  }
  return <BoardDetailPage key={id} />;
}

export function BoardsWorkspacePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedBoardId = useMemo(() => {
    const m = matchPath({ path: '/app/boards/:id', end: true }, location.pathname);
    const rid = m?.params?.id;
    if (!rid || rid === 'library' || rid === 'new') return undefined;
    return rid;
  }, [location.pathname]);

  const [query, setQuery] = useState('');
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [boardMenu, setBoardMenu] = useState<BoardMenuState | null>(null);
  const [dropTarget, setDropTarget] = useState<'ungrouped' | string | null>(null);
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [pendingFirstOpenIds, setPendingFirstOpenIds] = useState<string[]>(() => [...getPendingFirstOpenBoardIds()]);

  useEffect(() => {
    const onGallery = matchPath({ path: '/app/boards', end: true }, location.pathname);
    if (onGallery) {
      setPendingFirstOpenIds([...getPendingFirstOpenBoardIds()]);
    }
  }, [location.pathname]);

  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);

  const { data: items = [], isPending, isError } = useQuery({
    queryKey: BOARDS_LIST_QUERY_KEY,
    queryFn: fetchBoards,
    staleTime: 60_000,
  });

  const { data: folders = [] } = useQuery({
    queryKey: BOARDS_FOLDERS_QUERY_KEY,
    queryFn: fetchBoardFolders,
    staleTime: 60_000,
  });

  const foldersByParent = useMemo(() => {
    const m = new Map<string | null, BoardFolderDto[]>();
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
    return items.filter(
      (b) =>
        b.title?.toLowerCase().includes(q) ||
        b.subject?.toLowerCase().includes(q) ||
        b.topic?.toLowerCase().includes(q) ||
        b.folder?.path?.toLowerCase().includes(q),
    );
  }, [items, query]);

  const subtreeBoardCountByFolder = useMemo(() => {
    const direct = new Map<string, number>();
    for (const b of items) {
      const id = b.folder?.id;
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

  const subtreeFilteredBoardCountByFolder = useMemo(() => {
    const direct = new Map<string, number>();
    for (const b of filteredItems) {
      const id = b.folder?.id;
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

  const directBoardsByFolderId = useMemo(() => {
    const m = new Map<string, BoardListItem[]>();
    for (const b of filteredItems) {
      const fid = b.folder?.id;
      if (!fid) continue;
      if (!m.has(fid)) m.set(fid, []);
      m.get(fid)!.push(b);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
    }
    return m;
  }, [filteredItems]);

  const ungroupedBoards = useMemo(() => {
    const list = filteredItems.filter((b) => !b.folder?.id);
    return [...list].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'));
  }, [filteredItems]);

  const boardMenuTarget = useMemo(
    () => (boardMenu ? (items.find((x) => x.id === boardMenu.boardId) ?? null) : null),
    [boardMenu, items],
  );

  const deleteMutation = useMutation({
    mutationFn: (boardId: string) => deleteBoard(boardId),
    onSuccess: (_data, boardId) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      setBoardMenu(null);
      if (boardId === selectedBoardId) navigate('/app/boards', { replace: true });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (boardId: string) => duplicateBoard(boardId),
    onSuccess: (clone) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      setBoardMenu(null);
      addPendingFirstOpenBoard(clone.id);
      setPendingFirstOpenIds([...getPendingFirstOpenBoardIds()]);
      navigate('/app/boards', { replace: true });
    },
  });

  const flagsMutation = useMutation({
    mutationFn: (args: {
      id: string;
      library_public?: boolean;
      student_link_enabled?: boolean;
    }) => updateBoardCode(args.id, args),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(variables.id) });
      if (variables.library_public !== undefined) {
        queryClient.invalidateQueries({ queryKey: BOARDS_LIBRARY_QUERY_KEY });
      }
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (payload: { name: string; parent?: string | null }) => createBoardFolder(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_FOLDERS_QUERY_KEY });
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
    mutationFn: (folderId: string) => deleteBoardFolder(folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_FOLDERS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id: fid, name }: { id: string; name: string }) => updateBoardFolder(fid, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BOARDS_FOLDERS_QUERY_KEY }),
  });

  const moveBoardMutation = useMutation({
    mutationFn: ({ boardId, folderId }: { boardId: string; folderId: string | null }) =>
      updateBoardCode(boardId, { folder_id: folderId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY }),
  });

  const handleDeleteBoard = (item: BoardListItem) => {
    if (!window.confirm(`Tafelbild „${item.title ?? 'Ohne Titel'}" wirklich löschen?`)) return;
    deleteMutation.mutate(item.id);
  };

  const handleCreateRootFolder = () => {
    const siblingNames = new Set(folders.filter((f) => f.parent == null).map((f) => f.name));
    const name = uniqueSiblingFolderName(siblingNames);
    createFolderMutation.mutate({ name, parent: null });
  };

  const openFolderMenu = (e: ReactMouseEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setBoardMenu(null);
    setFolderMenu({ x: e.clientX, y: e.clientY, folderId });
  };

  const openBoardMenu = (e: ReactMouseEvent, boardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderMenu(null);
    setBoardMenu({ x: e.clientX, y: e.clientY, boardId });
  };

  const closeFolderMenu = useCallback(() => setFolderMenu(null), []);
  const closeBoardMenu = useCallback(() => setBoardMenu(null), []);

  useEffect(() => {
    const onWinDragEnd = () => {
      setDraggingBoardId(null);
      setDropTarget(null);
    };
    window.addEventListener('dragend', onWinDragEnd, true);
    return () => window.removeEventListener('dragend', onWinDragEnd, true);
  }, []);

  const toggleFolderCollapsed = useCallback((folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

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
    const boardTotal = subtreeBoardCountByFolder.get(folderId) ?? 0;
    const subfolderTotal = countDescendantSubfolders(folderId, folders);
    const parts = [
      `Ordner „${label}" wirklich löschen?`,
      '',
      'Alle Tafelbilder in diesem Ordner und in allen Unterordnern verlieren die Ordnerzuordnung und erscheinen wieder unter „Ohne Ordner".',
    ];
    if (subfolderTotal > 0) {
      parts.push(
        `${subfolderTotal} Unterordner ${subfolderTotal === 1 ? 'wird' : 'werden'} mit entfernt — die Ordnerstruktur darunter wird aufgelöst.`,
      );
    }
    parts.push(
      '',
      boardTotal > 0
        ? `Betroffene Tafelbilder (Summe inkl. Unterordner): ${boardTotal}.`
        : 'In diesem Teil der Galerie sind derzeit keine Tafelbilder zugeordnet.',
      '',
      'Fortfahren?',
    );
    if (!window.confirm(parts.join('\n'))) return;
    deleteFolderMutation.mutate(folderId);
  };

  const onBoardDragStart = (e: DragEvent<HTMLButtonElement>, boardId: string, title: string) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.setData(DND_BOARD_MIME, boardId);
    dt.effectAllowed = 'move';
    setDraggingBoardId(boardId);
    setBoardDragGhost(dt, title);
  };

  const onBoardDragEnd = useCallback(() => {
    setDraggingBoardId(null);
    setDropTarget(null);
  }, []);

  const onExplorerDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const dragLeaveUnlessChild = (e: DragEvent<Element>, targetKey: 'ungrouped' | string) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDropTarget((t) => (t === targetKey ? null : t));
  };

  const parseDropBoardId = (e: DragEvent) =>
    e.dataTransfer.getData(DND_BOARD_MIME) || e.dataTransfer.getData('text/plain');

  const handleAssignDrop = (e: DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDropTarget(null);
    setDraggingBoardId(null);
    const id = parseDropBoardId(e).trim();
    if (!id) return;
    moveBoardMutation.mutate({ boardId: id, folderId });
  };

  const qActive = query.trim().length > 0;

  const renderBoardRow = (b: BoardListItem, depthPx: number, highlightFirstOpen = false) => {
    const active = selectedBoardId === b.id;
    const titleLabel = b.title || 'Ohne Titel';
    const isDraggingThis = draggingBoardId === b.id;
    return (
      <div
        key={b.id}
        style={{ paddingLeft: `${depthPx}px` }}
        className={cn(
          'group/row flex max-w-full items-center gap-0.5 rounded-lg pr-0.5 transition-[opacity,transform,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
          highlightFirstOpen &&
            !active &&
            'bg-emerald-50 ring-1 ring-emerald-200/90',
          isDraggingThis && 'opacity-[0.42] scale-[0.985] bg-indigo-50/50 ring-1 ring-dashed ring-indigo-300/70',
        )}
        onContextMenu={(e) => openBoardMenu(e, b.id)}
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => onBoardDragStart(e, b.id, titleLabel)}
          onDragEnd={onBoardDragEnd}
          className={cn(
            'inline-flex shrink-0 cursor-grab touch-none rounded-md p-0.5 outline-none',
            'text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing',
            'focus-visible:ring-2 focus-visible:ring-indigo-400',
          )}
          aria-label={`„${titleLabel}" zum Ordner verschieben`}
          title="Zum Sortieren ziehen"
          onClick={(e) => e.preventDefault()}
        >
          <GripVertical size={14} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <NavLink
            to={`/app/boards/${b.id}`}
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-lg py-1.5 pr-1 pl-1 text-left text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
              active ? 'bg-indigo-50 font-medium text-indigo-900' : 'text-slate-800 hover:bg-slate-50',
            )}
            title={titleLabel}
            draggable={false}
            onContextMenu={(e) => openBoardMenu(e, b.id)}
          >
            <Presentation size={14} className={cn('shrink-0', active ? 'text-indigo-600' : 'text-slate-400')} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{titleLabel}</span>
          </NavLink>
        </div>
        <IconButton
          variant="danger"
          size="sm"
          className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
          aria-label={`„${titleLabel}" löschen`}
          title="Löschen"
          disabled={deleteMutation.isPending}
          onClick={(e) => {
            e.preventDefault();
            handleDeleteBoard(b);
          }}
          onContextMenu={(e) => openBoardMenu(e, b.id)}
        >
          <Trash2 size={12} aria-hidden />
        </IconButton>
      </div>
    );
  };

  return (
    <div className="flex min-h-full w-full flex-1 flex-col lg:flex-row">
      <aside
        className={cn(
          'flex max-h-[44vh] shrink-0 flex-col border-slate-200 bg-[var(--color-bg-card)] lg:max-h-none lg:w-[min(100%,300px)] lg:max-w-[340px] lg:border-r',
          'border-b lg:border-b-0',
          draggingBoardId != null && 'select-none',
        )}
      >
        <div className="shrink-0 space-y-2 border-b border-slate-100 p-2">
          <div className="flex flex-nowrap gap-1.5">
            <Button
              as="link"
              to="/app/boards/library"
              variant="secondary"
              size="sm"
              className="min-w-0 flex-1"
            >
              <span className="truncate">Tafelbibliothek</span>
            </Button>
            <Button
              type="button"
              size="sm"
              leftIcon={<Plus size={14} aria-hidden />}
              className="min-w-0 shrink-0"
              onClick={() => setNewBoardOpen(true)}
            >
              Neu
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              aria-label="Neuen Ordner auf oberster Ebene anlegen"
              title="Neuer Ordner"
              disabled={createFolderMutation.isPending}
              onClick={handleCreateRootFolder}
            >
              <FolderPlus size={18} aria-hidden />
            </IconButton>
            <SearchInput
              placeholder="Titel, Fach, Thema …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Tafelbilder durchsuchen"
              containerClassName="min-w-0 flex-1"
            />
          </div>
        </div>

        {createFolderMutation.isError && (
          <div className="shrink-0 px-2">
            <Alert tone="error">
              {(createFolderMutation.error as { response?: { data?: { detail?: string } } })?.response?.data
                ?.detail ?? 'Ordner konnte nicht angelegt werden.'}
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
        {moveBoardMutation.isError && (
          <div className="shrink-0 px-2">
            <Alert tone="error">Verschieben in den Ordner ist fehlgeschlagen.</Alert>
          </div>
        )}
        {isError && (
          <div className="shrink-0 px-2">
            <Alert tone="error">Tafelbilder konnten nicht geladen werden.</Alert>
          </div>
        )}
        {deleteMutation.isError && (
          <div className="shrink-0 px-2">
            <Alert tone="error">Löschen fehlgeschlagen.</Alert>
          </div>
        )}
        {duplicateMutation.isError && (
          <div className="shrink-0 px-2">
            <Alert tone="error">Duplizieren fehlgeschlagen.</Alert>
          </div>
        )}
        {flagsMutation.isError && (
          <div className="shrink-0 px-2">
            <Alert tone="error">Freigabe-Einstellungen konnten nicht gespeichert werden.</Alert>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2">
          {isPending ? (
            <p className="px-2 text-sm text-slate-500">Lade …</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="Noch keine Tafelbilder"
              description="Lege ein interaktives Tafelbild über „Neu“ an."
              action={
                <Button
                  type="button"
                  size="sm"
                  leftIcon={<Plus size={14} aria-hidden />}
                  onClick={() => setNewBoardOpen(true)}
                >
                  Neues Tafelbild
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
                  Rechtsklick für Optionen. Zum Sortieren das{' '}
                  <span className="font-semibold text-slate-500">Griff-Symbol</span> links neben dem Titel greifen und auf
                  einen Ordner ziehen — der Titel-Link dient nur zum Öffnen, damit Klick und Ziehen sich nicht stören.
                  Neu erzeugte, aus der Tafelbibliothek übernommene oder duplizierte Tafelbilder sind grün hinterlegt,
                  bis du sie einmal in der Bearbeitung geöffnet hast.
                </p>
              </div>

              {filteredItems.length === 0 ? (
                <p className="px-2 text-sm text-slate-500">Keine Treffer — Suche anpassen.</p>
              ) : (
                <>
                  <motion.div
                    initial={false}
                    animate={{
                      scale: draggingBoardId != null && dropTarget === 'ungrouped' ? 1.02 : 1,
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
                      draggingBoardId != null &&
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
                          className={cn('h-4 w-4 transition-transform duration-150', ungroupedCollapsed && '-rotate-90')}
                          aria-hidden
                        />
                      </button>
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 pr-2 pl-0.5 text-left text-[13px] text-slate-800">
                        <FolderIcon size={14} className="shrink-0 text-slate-400" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">Ohne Ordner</span>
                        <span
                          className="shrink-0 tabular-nums text-[11px] text-slate-400"
                          title="Tafelbilder ohne Ordnerzuordnung (gefiltert)"
                        >
                          {ungroupedBoards.length}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                  {!ungroupedCollapsed ? (
                    <div className="mt-1 space-y-0.5 pb-2">
                      {ungroupedBoards.map((b) =>
                        renderBoardRow(b, 20, pendingFirstOpenIds.includes(b.id)),
                      )}
                    </div>
                  ) : null}

                  <div className="my-2 border-t border-slate-100" />

                  <FolderBranch
                    parentId={null}
                    depth={0}
                    foldersByParent={foldersByParent}
                    subtreeBoardCountByFolder={subtreeBoardCountByFolder}
                    subtreeFilteredBoardCountByFolder={subtreeFilteredBoardCountByFolder}
                    collapsedFolderIds={collapsedFolderIds}
                    toggleFolderCollapsed={toggleFolderCollapsed}
                    dropTarget={dropTarget}
                    setDropTarget={setDropTarget}
                    draggingBoardId={draggingBoardId}
                    onExplorerDragOver={onExplorerDragOver}
                    onFolderContextMenu={openFolderMenu}
                    onAssignDrop={handleAssignDrop}
                    dragLeaveUnlessChild={dragLeaveUnlessChild}
                    directBoardsByFolderId={directBoardsByFolderId}
                    queryActive={qActive}
                    pendingFirstOpenIds={pendingFirstOpenIds}
                    renderBoardRow={renderBoardRow}
                  />
                </>
              )}
            </>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-app)] lg:min-h-0">
        <Outlet />
      </section>

      <NewBoardModal
        open={newBoardOpen}
        onClose={() => setNewBoardOpen(false)}
        onPendingHighlightChange={() => setPendingFirstOpenIds([...getPendingFirstOpenBoardIds()])}
      />

      {folderMenu ? (
        <FolderContextMenuPortal
          state={folderMenu}
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

      {boardMenu && boardMenuTarget ? (
        <BoardContextMenuPortal
          state={boardMenu}
          board={boardMenuTarget}
          onClose={closeBoardMenu}
          duplicatePending={duplicateMutation.isPending}
          flagsPending={flagsMutation.isPending}
          deletePending={deleteMutation.isPending}
          onEdit={() => {
            closeBoardMenu();
            navigate(`/app/boards/${boardMenuTarget.id}`);
          }}
          onPreview={() => {
            closeBoardMenu();
            navigate(`/app/boards/${boardMenuTarget.id}/play`);
          }}
          onDuplicate={() => duplicateMutation.mutate(boardMenuTarget.id)}
          onToggleLibrary={() => {
            flagsMutation.mutate({
              id: boardMenuTarget.id,
              library_public: !boardMenuTarget.library_public,
            });
            closeBoardMenu();
          }}
          onToggleStudentLink={() => {
            flagsMutation.mutate({
              id: boardMenuTarget.id,
              student_link_enabled: !boardMenuTarget.student_link_enabled,
            });
            closeBoardMenu();
          }}
          onDelete={() => {
            closeBoardMenu();
            handleDeleteBoard(boardMenuTarget);
          }}
        />
      ) : null}
    </div>
  );
}

const FolderBranch = ({
  parentId,
  depth,
  foldersByParent,
  subtreeBoardCountByFolder,
  subtreeFilteredBoardCountByFolder,
  collapsedFolderIds,
  toggleFolderCollapsed,
  dropTarget,
  setDropTarget,
  draggingBoardId,
  onExplorerDragOver,
  dragLeaveUnlessChild,
  onFolderContextMenu,
  onAssignDrop,
  directBoardsByFolderId,
  queryActive,
  pendingFirstOpenIds,
  renderBoardRow,
}: {
  parentId: string | null;
  depth: number;
  foldersByParent: Map<string | null, BoardFolderDto[]>;
  subtreeBoardCountByFolder: Map<string, number>;
  subtreeFilteredBoardCountByFolder: Map<string, number>;
  collapsedFolderIds: Set<string>;
  toggleFolderCollapsed: (folderId: string) => void;
  dropTarget: string | null;
  setDropTarget: Dispatch<SetStateAction<'ungrouped' | string | null>>;
  draggingBoardId: string | null;
  onExplorerDragOver: (e: DragEvent) => void;
  dragLeaveUnlessChild: (e: DragEvent, targetKey: 'ungrouped' | string) => void;
  onFolderContextMenu: (e: ReactMouseEvent, folderId: string) => void;
  onAssignDrop: (e: DragEvent, folderId: string | null) => void;
  directBoardsByFolderId: Map<string, BoardListItem[]>;
  queryActive: boolean;
  pendingFirstOpenIds: string[];
  renderBoardRow: (b: BoardListItem, depthPx: number, highlightFirstOpen?: boolean) => ReactNode;
}) => {
  const rawList = foldersByParent.get(parentId) ?? [];
  const list = queryActive
    ? rawList.filter((f) => (subtreeFilteredBoardCountByFolder.get(f.id) ?? 0) > 0)
    : rawList;
  if (list.length === 0) return null;
  return (
    <>
      {list.map((f) => {
        const children = foldersByParent.get(f.id) ?? [];
        const hasChildFolders = children.length > 0;
        const isCollapsed = collapsedFolderIds.has(f.id);
        const boardTotal = subtreeBoardCountByFolder.get(f.id) ?? 0;
        const boardsHere = directBoardsByFolderId.get(f.id) ?? [];
        const boardIndent = 8 + (depth + 1) * 12;
        return (
          <div key={f.id}>
            <motion.div
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              initial={false}
              animate={{
                scale: draggingBoardId != null && dropTarget === f.id ? 1.02 : 1,
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
                draggingBoardId != null &&
                  dropTarget === f.id &&
                  'bg-indigo-50/90 shadow-[0_0_0_2px_theme(colors.indigo.500),0_12px_28px_-8px_rgba(79,70,229,0.35)]',
              )}
            >
              <div className="flex w-full max-w-full items-stretch gap-0.5">
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-indigo-400"
                  aria-label={
                    hasChildFolders || boardsHere.length > 0
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
                    title="Tafelbilder in diesem Ordner inkl. Unterordner"
                  >
                    {boardTotal}
                  </span>
                </button>
              </div>
            </motion.div>
            {!isCollapsed ? (
              <>
                <FolderBranch
                  parentId={f.id}
                  depth={depth + 1}
                  foldersByParent={foldersByParent}
                  subtreeBoardCountByFolder={subtreeBoardCountByFolder}
                  subtreeFilteredBoardCountByFolder={subtreeFilteredBoardCountByFolder}
                  collapsedFolderIds={collapsedFolderIds}
                  toggleFolderCollapsed={toggleFolderCollapsed}
                  dropTarget={dropTarget}
                  setDropTarget={setDropTarget}
                  draggingBoardId={draggingBoardId}
                  onExplorerDragOver={onExplorerDragOver}
                  dragLeaveUnlessChild={dragLeaveUnlessChild}
                  onFolderContextMenu={onFolderContextMenu}
                  onAssignDrop={onAssignDrop}
                  directBoardsByFolderId={directBoardsByFolderId}
                  queryActive={queryActive}
                  pendingFirstOpenIds={pendingFirstOpenIds}
                  renderBoardRow={renderBoardRow}
                />
                {boardsHere.length > 0 ? (
                  <div className="mt-0.5 space-y-0.5">
                    {boardsHere.map((b) =>
                      renderBoardRow(b, boardIndent, pendingFirstOpenIds.includes(b.id)),
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

const MenuDivider = () => <div className="my-1 border-t border-slate-100" role="separator" />;

const BoardContextMenuPortal = ({
  state,
  board,
  onClose,
  onEdit,
  onPreview,
  onDuplicate,
  onToggleLibrary,
  onToggleStudentLink,
  onDelete,
  duplicatePending,
  flagsPending,
  deletePending,
}: {
  state: BoardMenuState;
  board: BoardListItem;
  onClose: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onDuplicate: () => void;
  onToggleLibrary: () => void;
  onToggleStudentLink: () => void;
  onDelete: () => void;
  duplicatePending: boolean;
  flagsPending: boolean;
  deletePending: boolean;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const id = window.requestAnimationFrame(() => {
      document.addEventListener('mousedown', onDoc, true);
    });
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener('mousedown', onDoc, true);
    };
  }, [onClose]);

  const title = board.title || 'Ohne Titel';
  const flagsDisabled = flagsPending || duplicatePending || deletePending;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Kontextmenü: ${title}`}
      style={{ position: 'fixed', left: state.x, top: state.y, zIndex: 60 }}
      className="min-w-[240px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
    >
      <MenuButton onClick={onEdit}>Bearbeiten und Einstellungen …</MenuButton>
      <MenuButton onClick={onPreview}>Vorschau (Vollbild)</MenuButton>
      <MenuButton onClick={onDuplicate} disabled={duplicatePending || flagsPending || deletePending}>
        Duplizieren
      </MenuButton>
      <MenuDivider />
      <MenuButton onClick={onToggleLibrary} disabled={flagsDisabled}>
        {board.library_public ? 'Aus Tafelbibliothek nehmen' : 'In Tafelbibliothek veröffentlichen'}
      </MenuButton>
      <MenuButton onClick={onToggleStudentLink} disabled={flagsDisabled}>
        {board.student_link_enabled ? 'Schüler-Link deaktivieren' : 'Schüler-Link aktivieren'}
      </MenuButton>
      <MenuDivider />
      <MenuButton onClick={onDelete} disabled={deletePending || duplicatePending} className="text-red-600 hover:bg-red-50">
        Tafelbild löschen …
      </MenuButton>
    </div>,
    document.body,
  );
};

const FolderContextMenuPortal = ({
  state,
  onClose,
  onRename,
  onNewSubfolder,
  onDelete,
}: {
  state: FolderMenuState;
  onClose: () => void;
  onRename: () => void;
  onNewSubfolder: () => void;
  onDelete: () => void;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const id = window.requestAnimationFrame(() => {
      document.addEventListener('mousedown', onDoc, true);
    });
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener('mousedown', onDoc, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', left: state.x, top: state.y, zIndex: 60 }}
      className="min-w-[200px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
    >
      <MenuButton onClick={onNewSubfolder}>Neuer Unterordner</MenuButton>
      <MenuButton onClick={onRename}>Umbenennen …</MenuButton>
      <MenuButton onClick={onDelete} className="text-red-600 hover:bg-red-50">
        Ordner löschen …
      </MenuButton>
    </div>,
    document.body,
  );
};

const MenuButton = ({
  children,
  onClick,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    className={cn(
      'block w-full px-3 py-2 text-left text-[13px] text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    onClick={(e) => {
      e.stopPropagation();
      if (disabled) return;
      onClick();
    }}
  >
    {children}
  </button>
);

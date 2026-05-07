import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { Alert, Button, IconButton } from '../../../components/ui';
import {
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_FOLDERS_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
} from '../../../lib/listQueries';
import { formatDate, formatDateTime } from '../../../lib/formatDate';
import { useAuth } from '../../../lib/authContext';
import { cn } from '../../../lib/cn';
import {
  applyBoardRevision,
  deleteBoardRevision,
  fetchBoard,
  fetchBoardFolders,
  fetchBoardRevisions,
  reviseBoard,
  revertLastBoardRevision,
  updateBoardCode,
} from '../boardsApi';
import { BoardLibraryPublishModal } from '../components/BoardLibraryPublishModal';
import { BoardAiGenerationOverlay } from '../components/BoardAiGenerationOverlay';
import { BoardFullscreenPreview } from '../components/BoardFullscreenPreview';
import { RevisionModeSelect } from '../components/quality/RevisionModeSelect';
import { RevisionQuickActions } from '../components/quality/RevisionQuickActions';
import type { BoardCodeUpdate, BoardDetail, BoardRevision, RevisionMode } from '../types';
import { clearPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';

/** Liste neueste zuerst (API): v1 = älteste Revision, höhere Nummer = neuer. */
const revisionVLabel = (indexNewestFirst: number, total: number) => {
  const n = total > 0 ? total - indexNewestFirst : 1;
  return `v${n}`;
};

function BoardShellModal({
  open,
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        aria-label="Schließen"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[min(92dvh,920px)] w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl',
          wide ? 'max-w-5xl' : 'max-w-lg',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-900">{title}</h2>
          <IconButton type="button" variant="ghost" size="sm" aria-label="Schließen" onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-slate-100 px-4 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function BoardDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [reviseOpen, setReviseOpen] = useState(false);
  const [fatalOpen, setFatalOpen] = useState(false);

  const [reviseError, setReviseError] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [reviseInput, setReviseInput] = useState('');
  const [revisionMode, setRevisionMode] = useState<RevisionMode>('general');
  const [reloadKey, setReloadKey] = useState(0);
  const scriptsEnabled = true;
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(null);
  const [libraryModalMode, setLibraryModalMode] = useState<'publish' | 'edit_listing' | null>(null);
  const [libraryModalError, setLibraryModalError] = useState<string | null>(null);
  const [libraryShareMessage, setLibraryShareMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  useLayoutEffect(() => {
    return () => {
      document.body.style.removeProperty('overflow');
    };
  }, [id]);

  useEffect(() => {
    if (id) clearPendingFirstOpenBoard(id);
  }, [id]);

  const { data: board, isPending, isError } = useQuery({
    queryKey: BOARDS_DETAIL_QUERY_KEY(id),
    queryFn: () => fetchBoard(id),
    enabled: Boolean(id),
  });

  const { data: revisions = [] } = useQuery({
    queryKey: ['board-revisions', id],
    queryFn: () => fetchBoardRevisions(id),
    enabled: Boolean(id),
  });

  const revisionHeadId = useMemo(() => {
    if (!board) return null;
    return board.revision_head_id ?? revisions[0]?.id ?? null;
  }, [board, revisions]);

  const previewRevision = useMemo((): BoardRevision | null => {
    if (!board || previewRevisionId === null) return null;
    if (!revisionHeadId || previewRevisionId === revisionHeadId) return null;
    return revisions.find((r) => r.id === previewRevisionId) ?? null;
  }, [board, previewRevisionId, revisionHeadId, revisions]);

  const isHeadView = !previewRevision;

  const iframeBundle = useMemo(() => {
    if (!board) {
      return {
        html: '',
        css: '',
        javascript: '',
        used_libraries: [] as BoardDetail['used_libraries'],
        used_assets: [] as BoardDetail['used_assets'],
        used_datasets: undefined as BoardDetail['used_datasets'] | undefined,
      };
    }
    if (!previewRevision) {
      return {
        html: board.html,
        css: board.css,
        javascript: board.javascript,
        used_libraries: board.used_libraries ?? [],
        used_assets: board.used_assets ?? [],
        used_datasets: board.used_datasets,
      };
    }
    const nm = previewRevision.new_metadata ?? {};
    return {
      html: previewRevision.new_html,
      css: previewRevision.new_css,
      javascript: previewRevision.new_javascript,
      used_libraries: (nm.used_libraries as BoardDetail['used_libraries']) ?? board.used_libraries ?? [],
      used_assets: (nm.used_assets as BoardDetail['used_assets']) ?? board.used_assets ?? [],
      used_datasets: (nm.used_datasets as BoardDetail['used_datasets']) ?? board.used_datasets,
    };
  }, [board, previewRevision]);

  const canReviseWithAi = Boolean((board?.can_revise_with_ai ?? true) && isHeadView);

  const aiBlockedHint =
    'Nur am aktuellen Stand (neueste Version) verfügbar. Wähle oben „Aktueller Stand“ oder übernimm eine Version.';

  useEffect(() => {
    if (!previewRevisionId) return;
    if (!revisions.some((r) => r.id === previewRevisionId)) {
      setPreviewRevisionId(null);
    }
  }, [previewRevisionId, revisions]);

  const { data: folders = [] } = useQuery({
    queryKey: BOARDS_FOLDERS_QUERY_KEY,
    queryFn: fetchBoardFolders,
    staleTime: 60_000,
  });

  const foldersSorted = useMemo(
    () => [...folders].sort((a, b) => a.path.localeCompare(b.path, 'de')),
    [folders],
  );

  const reviseMutation = useMutation({
    mutationFn: ({ prompt, mode }: { prompt: string; mode: RevisionMode }) =>
      reviseBoard(id, prompt, { revision_mode: mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      setReviseInput('');
      setRevisionMode('general');
      setRevertError(null);
      setReloadKey((k) => k + 1);
      setReviseOpen(false);
      setPreviewRevisionId(null);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail;
      setReviseError(detail || (err as Error)?.message || 'Revision fehlgeschlagen.');
    },
  });

  const revertMutation = useMutation({
    mutationFn: (revisionId: string) => revertLastBoardRevision(id, revisionId),
    onSuccess: () => {
      setRevertError(null);
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      setReloadKey((k) => k + 1);
      setPreviewRevisionId(null);
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail;
      setRevertError(detail || (err as Error)?.message || 'Zurücksetzen fehlgeschlagen.');
    },
  });

  const applyRevisionMutation = useMutation({
    mutationFn: (revisionId: string) => applyBoardRevision(id, revisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      setPreviewRevisionId(null);
      setReloadKey((k) => k + 1);
    },
  });

  const deleteRevisionMutation = useMutation({
    mutationFn: (revisionId: string) => deleteBoardRevision(id, revisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      setPreviewRevisionId(null);
    },
  });

  const patchMutation = useMutation({
    mutationFn: (body: BoardCodeUpdate) => updateBoardCode(id, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      setReloadKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      if (
        variables.library_public !== undefined ||
        variables.library_listing_title !== undefined ||
        variables.library_listing_topic !== undefined ||
        variables.library_listing_description !== undefined ||
        variables.library_sync_public_snapshot
      ) {
        queryClient.invalidateQueries({ queryKey: ['boards', 'library'] });
      }
    },
  });

  const handleSyncPublicLibrarySnapshot = useCallback(() => {
    setLibraryShareMessage(null);
    patchMutation.mutate(
      { library_sync_public_snapshot: true },
      {
        onSuccess: () =>
          setLibraryShareMessage({
            tone: 'info',
            text: 'Die öffentliche Bibliotheksfassung wurde mit deinem aktuellen Arbeitsstand abgeglichen.',
          }),
        onError: (err: unknown) => {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            (err as Error)?.message ||
            'Aktualisierung fehlgeschlagen.';
          setLibraryShareMessage({ tone: 'error', text: detail });
        },
      },
    );
  }, [patchMutation]);

  const handleRevise = () => {
    setReviseError(null);
    if (!reviseInput.trim()) {
      setReviseError('Bitte beschreibe deinen Änderungswunsch.');
      return;
    }
    reviseMutation.mutate({ prompt: reviseInput.trim(), mode: revisionMode });
  };

  const handleRevertRevision = () => {
    const latestId = revisions[0]?.id;
    if (!latestId) return;
    const confirmed = window.confirm(
      'Stand vor der letzten KI-Überarbeitung wiederherstellen? Die aktuelle Fassung wird dabei verworfen.',
    );
    if (!confirmed) return;
    setRevertError(null);
    revertMutation.mutate(latestId);
  };

  const handleConfirmDeleteRevision = (revisionId: string) => {
    const confirmed = window.confirm(
      'Diesen Versionseintrag aus der Historie löschen? Der aktuelle Board-Stand bleibt unverändert.',
    );
    if (!confirmed) return;
    deleteRevisionMutation.mutate(revisionId);
  };

  const reviseBlockedTitle: string | undefined = !canReviseWithAi
    ? !isHeadView
      ? aiBlockedHint
      : 'Änderungen speichern, bis der Stand wieder der neuesten Version entspricht.'
    : undefined;

  if (isPending) {
    return (
      <div className="flex min-h-[12rem] flex-1 items-center justify-center text-sm text-slate-500 lg:min-h-0">
        Lade Board …
      </div>
    );
  }

  if (isError || !board) {
    return (
      <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-4 px-4 lg:min-h-0">
        <Alert tone="error">Board konnte nicht geladen werden.</Alert>
        <Button variant="secondary" onClick={() => navigate('/app/boards')}>
          Zurück zur Galerie
        </Button>
      </div>
    );
  }

  const showFatalErrors = (board.validation_errors || []).length > 0;

  const publicOnlineVersionLabel =
    board.library_snapshot_at != null && String(board.library_snapshot_at).trim() !== ''
      ? formatDateTime(board.library_snapshot_at)
      : board.library_published_at
        ? formatDateTime(board.library_published_at)
        : '—';

  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-x-hidden bg-[var(--color-bg-app)]">
      <BoardAiGenerationOverlay open={reviseMutation.isPending} variant="revise" />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-20 flex shrink-0 flex-col gap-1 border-b border-slate-200/80 bg-white/95 px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top,0px))] shadow-sm backdrop-blur-sm sm:px-3">
        {showFatalErrors && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-900 ring-1 ring-red-200">
            <span className="font-medium">Validierungsfehler im Board</span>
            <Button type="button" variant="danger" size="sm" onClick={() => setFatalOpen(true)}>
              Details
            </Button>
          </div>
        )}

        <div className="flex min-h-10 flex-wrap items-center gap-x-1 gap-y-1">
          <div className="min-w-0 max-w-[min(100%,11rem)] sm:max-w-xs">
            <p className="truncate text-xs font-semibold text-slate-900 sm:text-sm">{board.title || 'Board'}</p>
            {board.description ? (
              <p className="truncate text-[10px] text-slate-500 sm:text-xs">{board.description}</p>
            ) : null}
          </div>

          <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />

          <select
            className="max-w-[140px] rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-1 text-[11px] text-slate-800 sm:max-w-[200px] sm:text-xs"
            value={board.folder?.id ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              patchMutation.mutate({ folder_id: v === '' ? null : v });
            }}
            disabled={patchMutation.isPending}
            aria-label="Galerie-Ordner"
            title="Ordner"
          >
            <option value="">Ohne Ordner</option>
            {foldersSorted.map((f) => (
              <option key={f.id} value={f.id}>
                {f.path}
              </option>
            ))}
          </select>

          <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />

          <select
            className="max-w-[7.5rem] rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-1 text-[11px] text-slate-800 sm:max-w-[14rem] sm:text-xs"
            value={previewRevisionId ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setPreviewRevisionId(v === '' ? null : v);
            }}
            disabled={revisions.length === 0 || applyRevisionMutation.isPending}
            aria-label="Board-Version"
            title="Versionen durchblättern"
          >
            <option value="">Aktueller Stand</option>
            {revisions.map((r, idx) => (
              <option key={r.id} value={r.id}>
                {revisionVLabel(idx, revisions.length)} · {formatDate(r.created_at)}
              </option>
            ))}
          </select>

          {previewRevision ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="!px-2"
                loading={applyRevisionMutation.isPending}
                onClick={() => applyRevisionMutation.mutate(previewRevision.id)}
              >
                Übernehmen
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                className="!px-2"
                loading={deleteRevisionMutation.isPending}
                aria-label="Versionseintrag löschen"
                onClick={() => handleConfirmDeleteRevision(previewRevision.id)}
              >
                <Trash2 size={14} aria-hidden />
              </Button>
            </>
          ) : null}

          <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />

          <Button
            type="button"
            size="sm"
            className="!px-2"
            disabled={!canReviseWithAi}
            title={reviseBlockedTitle}
            onClick={() => setReviseOpen(true)}
          >
            <Sparkles size={14} className="sm:mr-1" aria-hidden />
            <span className="hidden sm:inline">Nachprompten</span>
          </Button>
        </div>

        {libraryShareMessage ? (
          <div className="pt-1">
            <Alert tone={libraryShareMessage.tone === 'error' ? 'error' : 'info'}>{libraryShareMessage.text}</Alert>
          </div>
        ) : null}

        {board.library_public ? (
          <div className="mt-1 rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50/90 px-3 py-2.5 ring-1 ring-emerald-200/70">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
              <div className="flex min-w-0 flex-1 gap-2">
                <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-emerald-950">Öffentlich in der Bibliothek</p>
                  <p className="mt-0.5 text-sm font-semibold text-emerald-900">
                    Online-Version: <span className="tabular-nums text-emerald-950">{publicOnlineVersionLabel}</span>
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-emerald-800/90">
                    <span className="font-medium">Karte:</span>{' '}
                    {board.library_listing_title?.trim() || board.title || '—'}
                  </p>
                  {board.library_public_live_differs ? (
                    <p className="mt-2 text-[11px] font-semibold text-amber-900">
                      Hinweis: Dein gespeicherter Arbeitsstand unterscheidet sich von dieser Online-Fassung.
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-emerald-800/80">
                      Gespeicherter Stand und öffentliche Fassung stimmen überein.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 lg:items-end">
                <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:pt-0.5">
                  <Button
                    type="button"
                    size="sm"
                    loading={patchMutation.isPending}
                    disabled={patchMutation.isPending}
                    onClick={handleSyncPublicLibrarySnapshot}
                  >
                    Öffentliche Fassung aktualisieren
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={patchMutation.isPending}
                    onClick={() => {
                      setLibraryModalError(null);
                      setLibraryModalMode('edit_listing');
                    }}
                  >
                    Bibliotheks-Texte
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-800 hover:bg-red-50"
                    disabled={patchMutation.isPending}
                    onClick={() => {
                      const ok = window.confirm(
                        'Dieses Board aus der öffentlichen Bibliothek nehmen? Der Eintrag ist danach für andere nicht mehr sichtbar.',
                      );
                      if (!ok) return;
                      setLibraryShareMessage(null);
                      patchMutation.mutate(
                        { library_public: false },
                        {
                          onError: (err: unknown) => {
                            const detail =
                              (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                              (err as Error)?.message ||
                              'Konnte nicht entfernt werden.';
                            setLibraryShareMessage({ tone: 'error', text: detail });
                          },
                        },
                      );
                    }}
                  >
                    Aus Bibliothek nehmen
                  </Button>
                </div>
                {board.avg_rating != null || (board.rating_count ?? 0) > 0 ? (
                  <p className="text-[11px] text-emerald-900/80 lg:text-right">
                    Bewertung:{' '}
                    {board.avg_rating != null ? `Ø ${board.avg_rating.toFixed(1)}` : 'noch keine'}
                    {board.rating_count
                      ? ` · ${board.rating_count} Bewertung${board.rating_count === 1 ? '' : 'en'}`
                      : ''}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-700">
            <span>Dieses Board ist nur für dich sichtbar.</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={patchMutation.isPending}
              onClick={() => {
                setLibraryModalError(null);
                setLibraryModalMode('publish');
              }}
            >
              In Bibliothek veröffentlichen
            </Button>
          </div>
        )}
      </header>

      <BoardFullscreenPreview
        className="min-h-0 flex-1"
        layoutKey={id}
        viewTransitionGroupName="board-editor-fs-root"
        reloadKey={reloadKey}
        onReload={() => setReloadKey((k) => k + 1)}
        html={iframeBundle.html}
        css={iframeBundle.css}
        javascript={iframeBundle.javascript}
        boardFrameId={board.id}
        usedLibraries={iframeBundle.used_libraries ?? []}
        usedDatasets={iframeBundle.used_datasets}
        scriptsEnabled={scriptsEnabled}
      />
    </div>

      <BoardShellModal
        open={reviseOpen}
        title="Board nachprompten (KI)"
        onClose={() => !reviseMutation.isPending && setReviseOpen(false)}
        wide
      >
        <ReviseTab
          value={reviseInput}
          onChange={setReviseInput}
          mode={revisionMode}
          onModeChange={setRevisionMode}
          error={reviseError}
          revertError={revertError}
          busy={reviseMutation.isPending}
          revertBusy={revertMutation.isPending}
          canRevert={isHeadView && revisions.length > 0}
          onRevert={handleRevertRevision}
          onSubmit={handleRevise}
          board={board}
          autoFocus
        />
      </BoardShellModal>

      <BoardShellModal open={fatalOpen} title="Validierungsfehler" onClose={() => setFatalOpen(false)}>
        <Alert tone="error">
          <ul className="list-inside list-disc text-sm">
            {board.validation_errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </Alert>
      </BoardShellModal>

      {board ? (
        <BoardLibraryPublishModal
          open={libraryModalMode !== null}
          mode={libraryModalMode === 'edit_listing' ? 'edit_listing' : 'publish'}
          onClose={() => {
            if (patchMutation.isPending) return;
            setLibraryModalMode(null);
            setLibraryModalError(null);
          }}
          busy={patchMutation.isPending}
          error={libraryModalError}
          privateHints={{ title: board.title, topic: board.topic }}
          initialListing={
            libraryModalMode === 'edit_listing'
              ? {
                  library_listing_title: board.library_listing_title ?? '',
                  library_listing_topic: board.library_listing_topic ?? '',
                  library_listing_description: board.library_listing_description ?? '',
                }
              : undefined
          }
          onSubmit={(p) => {
            if (libraryModalMode === 'publish') {
              patchMutation.mutate(
                { library_public: true, ...p },
                {
                  onSuccess: () => {
                    setLibraryModalMode(null);
                    setLibraryModalError(null);
                  },
                  onError: (err: unknown) => {
                    const detail =
                      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                      (err as Error)?.message ||
                      'Veröffentlichen fehlgeschlagen.';
                    setLibraryModalError(detail);
                  },
                },
              );
              return;
            }
            if (libraryModalMode === 'edit_listing') {
              patchMutation.mutate(
                { ...p },
                {
                  onSuccess: () => {
                    setLibraryModalMode(null);
                    setLibraryModalError(null);
                  },
                  onError: (err: unknown) => {
                    const detail =
                      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                      (err as Error)?.message ||
                      'Speichern fehlgeschlagen.';
                    setLibraryModalError(detail);
                  },
                },
              );
            }
          }}
          moderationRequired={!user?.is_staff}
        />
      ) : null}
    </div>
  );
}

const ReviseTab = ({
  value,
  onChange,
  mode,
  onModeChange,
  error,
  revertError,
  busy,
  revertBusy,
  canRevert,
  onRevert,
  onSubmit,
  board,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  mode: RevisionMode;
  onModeChange: (m: RevisionMode) => void;
  error: string | null;
  revertError: string | null;
  busy: boolean;
  revertBusy: boolean;
  canRevert: boolean;
  onRevert: () => void;
  onSubmit: () => void;
  board: BoardDetail;
  autoFocus?: boolean;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Beschreibe in eigenen Worten, was am Board verändert werden soll. Die KI liefert eine überarbeitete
        Komplettfassung von HTML, CSS und JavaScript zurück.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <RevisionModeSelect value={mode} onChange={onModeChange} disabled={busy} />
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-600">Schnellauswahl</label>
          <RevisionQuickActions
            disabled={busy}
            onPick={(action) => {
              onModeChange(action.mode);
              if (!value.trim()) onChange(action.prompt);
            }}
          />
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        placeholder="z. B. Mache es grundschulgerechter und füge eine Wortspeicher-Box hinzu."
      />
      {error && <Alert tone="error">{error}</Alert>}
      {revertError && <Alert tone="error">{revertError}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Status:{' '}
          {board.status === 'generated' ? 'Erzeugt' : board.status === 'draft' ? 'Entwurf' : board.status}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canRevert && (
            <Button
              type="button"
              variant="secondary"
              onClick={onRevert}
              loading={revertBusy}
              disabled={busy}
              leftIcon={<Undo2 size={14} aria-hidden />}
            >
              Letzte Überarbeitung rückgängig
            </Button>
          )}
          <Button onClick={onSubmit} loading={busy} disabled={revertBusy}>
            Board überarbeiten
          </Button>
        </div>
      </div>
    </div>
  );
};

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Code2,
  FolderOpen,
  Gauge,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Alert, Button, IconButton } from '../../../components/ui';
import {
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_FOLDERS_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
} from '../../../lib/listQueries';
import { formatDate } from '../../../lib/formatDate';
import { cn } from '../../../lib/cn';
import { exitElementFullscreen } from '../../../lib/requestDocumentFullscreen';
import {
  applyBoardRevision,
  autoRepairBoard,
  deleteBoardRevision,
  fetchBoard,
  fetchBoardFolders,
  fetchBoardRevisions,
  reviseBoard,
  revertLastBoardRevision,
  runBoardQualityCheck,
  updateBoardCode,
  validateBoardCode,
} from '../boardsApi';
import { BoardAiGenerationOverlay } from '../components/BoardAiGenerationOverlay';
import { BoardFullscreenPreview } from '../components/BoardFullscreenPreview';
import { BoardShareQrModal } from '../components/BoardShareQrModal';
import { BoardStudentSharePrepModal } from '../components/BoardStudentSharePrepModal';
import { BoardQualityReportPanel } from '../components/quality/BoardQualityReportPanel';
import { BoardPipelineDetailsPanel } from '../components/quality/BoardPipelineDetailsPanel';
import { RevisionModeSelect } from '../components/quality/RevisionModeSelect';
import { RevisionQuickActions } from '../components/quality/RevisionQuickActions';
import { FreeHtmlValidationPanel } from '../components/free-html/FreeHtmlValidationPanel';
import { FreeHtmlResourcesPanel } from '../components/free-html/FreeHtmlResourcesPanel';
import { FreeHtmlCodeEditor } from '../components/free-html/FreeHtmlCodeEditor';
import { collectFreeHtmlLocalWarnings } from '../lib/freeHtmlLocalHints';
import { buildStudentBoardUrl } from '../publicBoardApi';
import type { BoardDetail, BoardRevision, RevisionMode } from '../types';
import { clearPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';
import { needsStudentSharePrep } from '../lib/studentShareFlow';

type CodeLang = 'html' | 'css' | 'javascript';
type MetaSection = 'validation' | 'quality' | 'pipeline' | 'hints' | 'resources' | 'share';

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

  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [codeEditorTab, setCodeEditorTab] = useState<CodeLang>('html');
  const [reviseOpen, setReviseOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaSection, setMetaSection] = useState<MetaSection>('validation');
  const [fatalOpen, setFatalOpen] = useState(false);

  const [reviseError, setReviseError] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [reviseInput, setReviseInput] = useState('');
  const [revisionMode, setRevisionMode] = useState<RevisionMode>('general');
  const [reloadKey, setReloadKey] = useState(0);
  const scriptsEnabled = true;
  const [validateResult, setValidateResult] = useState<{
    ok: boolean | null;
    errors: string[];
    warnings: string[];
  }>({ ok: null, errors: [], warnings: [] });
  const [shareQrOpen, setShareQrOpen] = useState(false);
  const [sharePrepOpen, setSharePrepOpen] = useState(false);
  const [shareQrPayload, setShareQrPayload] = useState<{
    url: string;
    expiresAt: string | null;
    title: string;
  } | null>(null);
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(null);

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

  const qualityCheckMutation = useMutation({
    mutationFn: () => runBoardQualityCheck(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
    },
  });

  const autoRepairMutation = useMutation({
    mutationFn: (mode?: RevisionMode) =>
      autoRepairBoard(id, mode && mode !== 'general' ? { revision_mode: mode } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      setReloadKey((k) => k + 1);
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
    mutationFn: (body: {
      html?: string;
      css?: string;
      javascript?: string;
      folder_id?: string | null;
      student_link_enabled?: boolean;
      student_link_valid_minutes?: number | null;
      library_public?: boolean;
    }) => updateBoardCode(id, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      setReloadKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      if (variables.library_public !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['boards', 'library'] });
      }
    },
  });

  const validateMutation = useMutation({
    mutationFn: (body?: { html?: string; css?: string; javascript?: string }) => validateBoardCode(id, body),
    onSuccess: (res) => {
      setValidateResult({ ok: res.ok, errors: res.errors || [], warnings: res.warnings || [] });
    },
    onError: () => {
      setValidateResult({ ok: false, errors: ['Validierung fehlgeschlagen.'], warnings: [] });
    },
  });

  const openMetaSection = useCallback(
    (section: MetaSection, runValidate?: boolean) => {
      setMetaSection(section);
      setMetaOpen(true);
      if (runValidate) validateMutation.mutate(undefined);
    },
    [validateMutation],
  );

  const localWarnings = useMemo(() => {
    return collectFreeHtmlLocalWarnings(
      iframeBundle.html,
      iframeBundle.css,
      iframeBundle.javascript,
    );
  }, [iframeBundle.css, iframeBundle.html, iframeBundle.javascript]);

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
      'Stand vor der letzten KI-Überarbeitung wiederherstellen? Die aktuelle Fassung (inklusive manueller Änderungen nach der Revision) wird dabei verworfen.',
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

  const showShareQrModalWithPayload = useCallback(
    (payload: { url: string; expiresAt: string | null; title: string }) => {
      void (async () => {
        await exitElementFullscreen();
        setShareQrPayload(payload);
        setShareQrOpen(true);
      })();
    },
    [],
  );

  const handleConfirmStudentShare = useCallback(
    (validMinutes: number) => {
      patchMutation.mutate(
        { student_link_enabled: true, student_link_valid_minutes: validMinutes },
        {
          onSuccess: async (data) => {
            await exitElementFullscreen();
            setSharePrepOpen(false);
            const token = data.share_token ?? board?.share_token ?? null;
            if (token) {
              setShareQrPayload({
                url: buildStudentBoardUrl(token),
                expiresAt: data.student_link_expires_at ?? null,
                title: data.title || board?.title || '',
              });
              setShareQrOpen(true);
            }
          },
        },
      );
    },
    [patchMutation, board?.share_token, board?.title],
  );

  const openExistingShareQr = useCallback(() => {
    if (!board?.share_token || !board.student_link_enabled) return;
    showShareQrModalWithPayload({
      url: buildStudentBoardUrl(board.share_token),
      expiresAt: board.student_link_expires_at ?? null,
      title: board.title || '',
    });
  }, [board, showShareQrModalWithPayload]);

  const handleShareToolbarClick = useCallback(() => {
    void (async () => {
      await exitElementFullscreen();
      if (!board || needsStudentSharePrep(board)) {
        setSharePrepOpen(true);
        return;
      }
      openExistingShareQr();
    })();
  }, [board, openExistingShareQr]);

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

  const renderMetaToolsBody = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-slate-100 pb-3">
        {(
          [
            ['validation', 'Prüfung'],
            ['quality', 'Qualität'],
            ['pipeline', 'Pipeline'],
            ['hints', 'Hinweise'],
            ['resources', 'Ressourcen'],
            ['share', 'Freigabe'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMetaSection(key);
              if (key === 'validation') validateMutation.mutate(undefined);
            }}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition',
              metaSection === key
                ? 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200'
                : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {metaSection === 'validation' ? (
        <FreeHtmlValidationPanel
          apiOk={validateResult.ok}
          apiErrors={validateResult.errors}
          apiWarnings={validateResult.warnings}
          onRunValidate={() => validateMutation.mutate(undefined)}
          busy={validateMutation.isPending}
        />
      ) : null}
      {metaSection === 'quality' ? (
        <BoardQualityReportPanel
          report={board.quality_report}
          isChecking={qualityCheckMutation.isPending}
          isRepairing={autoRepairMutation.isPending}
          onRunCheck={() => qualityCheckMutation.mutate()}
          onAutoRepair={() => autoRepairMutation.mutate(undefined)}
          assetsSummary={board.assets_summary}
          disableAutoRepair={!canReviseWithAi}
          autoRepairDisabledTitle={reviseBlockedTitle}
        />
      ) : null}
      {metaSection === 'pipeline' ? (
        <BoardPipelineDetailsPanel
          intent={board.intent_analysis}
          risk={board.risk_analysis}
          brief={board.creative_brief}
          dna={board.style_dna}
          modelConfig={board.used_model_config}
          tokenUsage={board.token_usage}
          estimatedCost={board.estimated_cost}
          repairHistory={board.repair_history}
        />
      ) : null}
      {metaSection === 'hints' ? <HintsTab board={board} revisions={revisions} /> : null}
      {metaSection === 'resources' ? (
        <FreeHtmlResourcesPanel
          usedLibraries={board.used_libraries}
          usedAssets={board.used_assets}
          usedDatasets={board.used_datasets}
          warnings={[...board.warnings, ...board.validation_warnings]}
        />
      ) : null}
      {metaSection === 'share' ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={board.student_link_enabled}
              disabled={patchMutation.isPending}
              onChange={(e) => patchMutation.mutate({ student_link_enabled: e.target.checked })}
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">Schüler-Link</span>
              <span className="mt-0.5 block text-xs text-slate-600">
                Kurzlink und QR ohne Anmeldung; gültig bis zu 3 Tage (dann erneut freigeben).
              </span>
            </span>
          </label>
          {board.student_link_enabled && board.share_token ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => openExistingShareQr()}>
                QR anzeigen
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (board.share_token) void navigator.clipboard.writeText(buildStudentBoardUrl(board.share_token));
                }}
              >
                Link kopieren
              </Button>
            </div>
          ) : null}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={board.library_public}
              disabled={patchMutation.isPending}
              onChange={(e) => patchMutation.mutate({ library_public: e.target.checked })}
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">In der Bibliothek listen</span>
            </span>
          </label>
          {board.library_public ? (
            <p className="text-xs text-slate-500">
              Bewertung:{' '}
              {board.avg_rating != null ? `Ø ${board.avg_rating.toFixed(1)}` : 'noch keine'}
              {board.rating_count
                ? ` · ${board.rating_count} Bewertung${board.rating_count === 1 ? '' : 'en'}`
                : ''}
            </p>
          ) : null}
          {board.source_board ? (
            <p className="text-xs text-slate-500">Übernommen aus der öffentlichen Bibliothek.</p>
          ) : null}
          <p className="text-[11px] text-slate-400">Stand: {formatDate(board.updated_at)}</p>
        </div>
      ) : null}
    </div>
  );

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

          <span className="hidden h-6 w-px bg-slate-200 lg:block" aria-hidden />

          <div className="flex flex-wrap items-center gap-0.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="!px-2"
              disabled={!isHeadView || patchMutation.isPending}
              title={!isHeadView ? aiBlockedHint : undefined}
              onClick={() => {
                setCodeEditorTab('html');
                setCodeEditorOpen(true);
              }}
              aria-haspopup="dialog"
            >
              <Code2 size={14} className="sm:mr-1" aria-hidden />
              <span className="hidden sm:inline">Code</span>
            </Button>
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

          <span className="hidden h-6 w-px bg-slate-200 lg:block" aria-hidden />

          <Button type="button" variant="secondary" size="sm" className="!px-2" onClick={() => openMetaSection('quality')}>
            <Gauge size={14} className="sm:mr-1" aria-hidden />
            <span className="hidden sm:inline">Qualität</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="!px-2"
            onClick={() => openMetaSection('resources')}
            aria-label="Ressourcen öffnen"
          >
            <FolderOpen size={14} className="sm:mr-1" aria-hidden />
            <span className="hidden sm:inline">Ressourcen</span>
          </Button>
          <Button type="button" variant="secondary" size="sm" className="!px-2" onClick={() => openMetaSection('hints')}>
            <BookOpen size={14} className="sm:mr-1" aria-hidden />
            <span className="hidden sm:inline">Hinweise</span>
          </Button>
        </div>
      </header>

      <BoardFullscreenPreview
        className="min-h-0 flex-1"
        layoutKey={id}
        viewTransitionGroupName="board-editor-fs-root"
        shareToolbarAction={{
          onClick: handleShareToolbarClick,
          loading: patchMutation.isPending && sharePrepOpen,
        }}
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
        open={codeEditorOpen}
        title="HTML, CSS & JavaScript"
        onClose={() => {
          if (!patchMutation.isPending) setCodeEditorOpen(false);
        }}
        wide
      >
        <div className="flex flex-wrap gap-1 border-b border-slate-100 pb-3">
          {(
            [
              ['html', 'HTML'],
              ['css', 'CSS'],
              ['javascript', 'JavaScript'],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setCodeEditorTab(tab)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                codeEditorTab === tab
                  ? 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {codeEditorTab === 'html' ? (
            <FreeHtmlCodeEditor
              code={board.html}
              language="html"
              busy={patchMutation.isPending}
              localWarnings={localWarnings}
              onSave={(html) => {
                patchMutation.mutate({ html });
              }}
            />
          ) : null}
          {codeEditorTab === 'css' ? (
            <FreeHtmlCodeEditor
              code={board.css}
              language="css"
              busy={patchMutation.isPending}
              localWarnings={localWarnings}
              onSave={(css) => {
                patchMutation.mutate({ css });
              }}
            />
          ) : null}
          {codeEditorTab === 'javascript' ? (
            <FreeHtmlCodeEditor
              code={board.javascript}
              language="javascript"
              busy={patchMutation.isPending}
              localWarnings={localWarnings}
              onSave={(javascript) => {
                patchMutation.mutate({ javascript });
              }}
            />
          ) : null}
        </div>
      </BoardShellModal>

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

      <BoardShellModal
        open={metaOpen}
        title="Werkzeuge & Freigabe"
        onClose={() => setMetaOpen(false)}
        wide
      >
        {renderMetaToolsBody()}
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

      <BoardStudentSharePrepModal
        open={sharePrepOpen}
        onClose={() => setSharePrepOpen(false)}
        onConfirm={handleConfirmStudentShare}
        busy={patchMutation.isPending}
      />
      <BoardShareQrModal
        open={shareQrOpen && Boolean(shareQrPayload?.url)}
        onClose={() => {
          setShareQrOpen(false);
          setShareQrPayload(null);
        }}
        studentUrl={shareQrPayload?.url ?? ''}
        title={shareQrPayload?.title ?? ''}
        expiresAt={shareQrPayload?.expiresAt}
      />
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

const HintsTab = ({
  board,
  revisions,
}: {
  board: BoardDetail;
  revisions: { id: string; created_at: string }[];
}) => (
  <div className="space-y-4">
    <section>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Lehrer-Hinweise</h3>
      <p className="whitespace-pre-line text-sm text-slate-700">
        {board.teacher_notes || 'Keine zusätzlichen Hinweise.'}
      </p>
    </section>
    <section>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Schritte</h3>
      {board.usage_instructions.length === 0 ? (
        <p className="text-sm text-slate-500">Keine Schrittfolge angegeben.</p>
      ) : (
        <ol className="list-inside list-decimal space-y-1 text-sm text-slate-700">
          {board.usage_instructions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
    </section>
    {board.warnings.length > 0 && (
      <Alert tone="warn">
        <ul className="list-inside list-disc text-sm">
          {board.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </Alert>
    )}
    {revisions.length > 0 && (
      <section>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Versionen</h3>
        <ul className="space-y-1 text-sm text-slate-600">
          {revisions.slice(0, 8).map((r, i) => (
            <li key={r.id} className="flex items-baseline gap-2">
              <span className="font-medium text-slate-800">
                {revisionVLabel(i, revisions.length)} · {formatDate(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    )}
  </div>
);

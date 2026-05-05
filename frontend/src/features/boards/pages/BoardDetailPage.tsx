import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Code2,
  Maximize2,
  RotateCw,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { Alert, Button, IconButton } from '../../../components/ui';
import {
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_FOLDERS_QUERY_KEY,
  BOARDS_LIBRARY_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
} from '../../../lib/listQueries';
import { formatDate } from '../../../lib/formatDate';
import { cn } from '../../../lib/cn';
import {
  fetchBoard,
  fetchBoardFolders,
  fetchBoardRevisions,
  reviseBoard,
  revertLastBoardRevision,
  updateBoardCode,
  validateBoardCode,
} from '../boardsApi';
import { BoardAiGenerationOverlay } from '../components/BoardAiGenerationOverlay';
import { BoardShareQrModal } from '../components/BoardShareQrModal';
import {
  boardStageClipBoxStyle,
  boardStageScaledInnerStyle,
  useBoardStageScale,
} from '../boardStageLayout';
import { FreeHtmlBoardFrame } from '../components/free-html/FreeHtmlBoardFrame';
import { FreeHtmlValidationPanel } from '../components/free-html/FreeHtmlValidationPanel';
import { FreeHtmlResourcesPanel } from '../components/free-html/FreeHtmlResourcesPanel';
import { FreeHtmlCodeEditor } from '../components/free-html/FreeHtmlCodeEditor';
import { collectFreeHtmlLocalWarnings } from '../lib/freeHtmlLocalHints';
import { buildStudentBoardUrl } from '../publicBoardApi';
import type { BoardDetail } from '../types';
import { clearPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';

type CodeLang = 'html' | 'css' | 'javascript';
type MetaSection = 'validation' | 'hints' | 'resources' | 'share';

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

  const stageOuterRef = useRef<HTMLDivElement>(null);
  const stageScale = useBoardStageScale(stageOuterRef);

  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [codeEditorTab, setCodeEditorTab] = useState<CodeLang>('html');
  const [reviseOpen, setReviseOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaSection, setMetaSection] = useState<MetaSection>('validation');
  const [fatalOpen, setFatalOpen] = useState(false);

  const [reviseError, setReviseError] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [reviseInput, setReviseInput] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const scriptsEnabled = true;
  const [validateResult, setValidateResult] = useState<{
    ok: boolean | null;
    errors: string[];
    warnings: string[];
  }>({ ok: null, errors: [], warnings: [] });
  const [shareQrOpen, setShareQrOpen] = useState(false);

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
    mutationFn: (prompt: string) => reviseBoard(id, prompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      setReviseInput('');
      setRevertError(null);
      setReloadKey((k) => k + 1);
      setReviseOpen(false);
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
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail;
      setRevertError(detail || (err as Error)?.message || 'Zurücksetzen fehlgeschlagen.');
    },
  });

  const patchMutation = useMutation({
    mutationFn: (body: {
      html?: string;
      css?: string;
      javascript?: string;
      folder_id?: string | null;
      student_link_enabled?: boolean;
      library_public?: boolean;
    }) => updateBoardCode(id, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      setReloadKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      if (variables.library_public !== undefined) {
        queryClient.invalidateQueries({ queryKey: BOARDS_LIBRARY_QUERY_KEY });
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
    if (!board) return [] as string[];
    return collectFreeHtmlLocalWarnings(board.html, board.css, board.javascript);
  }, [board?.html, board?.css, board?.javascript]);

  const handleRevise = () => {
    setReviseError(null);
    if (!reviseInput.trim()) {
      setReviseError('Bitte beschreibe deinen Änderungswunsch.');
      return;
    }
    reviseMutation.mutate(reviseInput.trim());
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

  if (isPending) {
    return (
      <div className="flex min-h-[12rem] flex-1 items-center justify-center text-sm text-slate-500 lg:min-h-0">
        Lade Tafelbild …
      </div>
    );
  }

  if (isError || !board) {
    return (
      <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-4 px-4 lg:min-h-0">
        <Alert tone="error">Tafelbild konnte nicht geladen werden.</Alert>
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
              <span className="mt-0.5 block text-xs text-slate-600">Kurzlink und QR ohne Anmeldung.</span>
            </span>
          </label>
          {board.student_link_enabled && board.share_token ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShareQrOpen(true)}>
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
              <span className="font-medium text-slate-900">In der Tafelbibliothek listen</span>
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
            <p className="text-xs text-slate-500">Übernommen aus der öffentlichen Tafelbibliothek.</p>
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
        <header className="relative z-20 flex shrink-0 flex-col gap-1 border-b border-slate-200/80 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur-sm sm:px-3">
        {showFatalErrors && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-900 ring-1 ring-red-200">
            <span className="font-medium">Validierungsfehler im Tafelbild</span>
            <Button type="button" variant="danger" size="sm" onClick={() => setFatalOpen(true)}>
              Details
            </Button>
          </div>
        )}

        <div className="flex min-h-10 flex-wrap items-center gap-x-1 gap-y-1">
          <div className="min-w-0 max-w-[10rem] sm:max-w-xs">
            <p className="truncate text-xs font-semibold text-slate-900 sm:text-sm">{board.title || 'Tafelbild'}</p>
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

          <span className="hidden h-6 w-px bg-slate-200 lg:block" aria-hidden />

          <div className="flex flex-wrap items-center gap-0.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="!px-2"
              onClick={() => {
                setCodeEditorTab('html');
                setCodeEditorOpen(true);
              }}
              aria-haspopup="dialog"
            >
              <Code2 size={14} className="sm:mr-1" aria-hidden />
              <span className="hidden sm:inline">Code</span>
            </Button>
            <Button type="button" size="sm" className="!px-2" onClick={() => setReviseOpen(true)}>
              <Sparkles size={14} className="sm:mr-1" aria-hidden />
              <span className="hidden sm:inline">Nachprompten</span>
            </Button>
          </div>

          <span className="hidden h-6 w-px bg-slate-200 lg:block" aria-hidden />

          <Button type="button" variant="secondary" size="sm" className="!px-2" onClick={() => openMetaSection('hints')}>
            <BookOpen size={14} className="sm:mr-1" aria-hidden />
            <span className="hidden sm:inline">Hinweise</span>
          </Button>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-0.5">
            <IconButton
              type="button"
              variant="secondary"
              size="sm"
              title="Vorschau neu laden"
              aria-label="Vorschau neu laden"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              <RotateCw size={14} aria-hidden />
            </IconButton>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="!px-2"
              onClick={() => navigate(`/app/boards/${board.id}/play`)}
            >
              <Maximize2 size={14} className="sm:mr-1" aria-hidden />
              <span className="hidden md:inline">Vollbild</span>
            </Button>
          </div>
        </div>
      </header>

      <div ref={stageOuterRef} className="relative min-h-0 flex-1 overflow-hidden bg-[var(--color-bg-app)]">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto bg-white" style={boardStageClipBoxStyle(stageScale)}>
            <div style={boardStageScaledInnerStyle(stageScale)}>
              <FreeHtmlBoardFrame
                html={board.html}
                css={board.css}
                javascript={board.javascript}
                scriptsEnabled={scriptsEnabled}
                reloadKey={reloadKey}
                usedLibraries={board.used_libraries}
                usedDatasets={board.used_datasets}
                fillHeight
                fitContainer
                className="!h-full !min-h-0 !rounded-none !ring-0"
              />
            </div>
          </div>
        </div>
      </div>
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
        title="Tafelbild nachprompten (KI)"
        onClose={() => !reviseMutation.isPending && setReviseOpen(false)}
        wide
      >
        <ReviseTab
          value={reviseInput}
          onChange={setReviseInput}
          error={reviseError}
          revertError={revertError}
          busy={reviseMutation.isPending}
          revertBusy={revertMutation.isPending}
          canRevert={revisions.length > 0}
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

      <BoardShareQrModal
        open={shareQrOpen && Boolean(board.share_token)}
        onClose={() => setShareQrOpen(false)}
        studentUrl={board.share_token ? buildStudentBoardUrl(board.share_token) : ''}
        title={board.title || ''}
      />
    </div>
  );
}

const ReviseTab = ({
  value,
  onChange,
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
        Beschreibe in eigenen Worten, was am Tafelbild verändert werden soll. Die KI liefert eine überarbeitete
        Komplettfassung von HTML, CSS und JavaScript zurück.
      </p>
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
            Tafelbild überarbeiten
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
  revisions: { id: string; prompt: string; created_at: string }[];
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
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Letzte Revisionen</h3>
        <ul className="space-y-1 text-sm text-slate-600">
          {revisions.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-baseline gap-2">
              <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
              <span>{r.prompt || '(ohne Text)'}</span>
            </li>
          ))}
        </ul>
      </section>
    )}
  </div>
);

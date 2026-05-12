import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { html as langHtml } from '@codemirror/lang-html';
import { css as langCss } from '@codemirror/lang-css';
import { javascript as langJs } from '@codemirror/lang-javascript';
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup';
import { X } from 'lucide-react';
import { Alert, Button, IconButton } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import {
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
  boardLibraryEntryQueryKey,
  boardsLibraryQueryKey,
} from '../../../lib/listQueries';
import { fetchBoard, updateBoardCode } from '../boardsApi';

type CodeTab = 'html' | 'css' | 'javascript';

const TABS: { id: CodeTab; label: string; hint: string }[] = [
  { id: 'html', label: 'HTML', hint: 'Markup der Bühne' },
  { id: 'css', label: 'CSS', hint: 'Darstellung' },
  { id: 'javascript', label: 'JavaScript', hint: 'Interaktion' },
];

type Props = {
  open: boolean;
  boardId: string | null;
  boardTitle?: string | null;
  onClose: () => void;
};

export function BoardCodeEditorModal({ open, boardId, boardTitle, onClose }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<CodeTab>('html');
  const [html, setHtml] = useState('');
  const [css, setCss] = useState('');
  const [javascript, setJavascript] = useState('');

  const detailQuery = useQuery({
    queryKey: BOARDS_DETAIL_QUERY_KEY(boardId ?? ''),
    queryFn: () => fetchBoard(boardId!),
    enabled: open && Boolean(boardId),
    staleTime: 0,
  });

  const baseline = detailQuery.data;
  const dirty = useMemo(() => {
    if (!baseline) return false;
    return (
      html !== (baseline.html ?? '') ||
      css !== (baseline.css ?? '') ||
      javascript !== (baseline.javascript ?? '')
    );
  }, [baseline, html, css, javascript]);

  useEffect(() => {
    if (!open || !boardId) return;
    setTab('html');
  }, [open, boardId]);

  useEffect(() => {
    if (!open || !boardId || !detailQuery.isSuccess || !detailQuery.data) return;
    if (detailQuery.data.id !== boardId) return;
    setHtml(detailQuery.data.html ?? '');
    setCss(detailQuery.data.css ?? '');
    setJavascript(detailQuery.data.javascript ?? '');
  }, [open, boardId, detailQuery.isSuccess, detailQuery.data?.id]);

  const saveMutation = useMutation({
    mutationFn: () => updateBoardCode(boardId!, { html, css, javascript }),
    onSuccess: (data) => {
      queryClient.setQueryData(BOARDS_DETAIL_QUERY_KEY(boardId!), data);
      void queryClient.invalidateQueries({ queryKey: boardsLibraryQueryKey('all') });
      void queryClient.invalidateQueries({ queryKey: boardsLibraryQueryKey('mine') });
      void queryClient.invalidateQueries({ queryKey: ['boards', 'library'] });
      void queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      if (boardId) {
        void queryClient.invalidateQueries({ queryKey: boardLibraryEntryQueryKey(boardId) });
      }
      setHtml(data.html ?? '');
      setCss(data.css ?? '');
      setJavascript(data.javascript ?? '');
    },
  });

  const extHtml = useMemo(() => [...basicSetup(), langHtml()], []);
  const extCss = useMemo(() => [...basicSetup(), langCss()], []);
  const extJs = useMemo(() => [...basicSetup(), langJs()], []);

  const handleTryClose = useCallback(() => {
    if (saveMutation.isPending) return;
    if (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    onClose();
  }, [saveMutation.isPending, dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      handleTryClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleTryClose]);

  if (!open || typeof document === 'undefined') return null;

  const titleLine = boardTitle?.trim() || 'Board-Code';
  const loadError = detailQuery.isError;
  const loading = detailQuery.isPending;

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="board-code-editor-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Editor schließen"
        disabled={saveMutation.isPending}
        onClick={handleTryClose}
      />
      <div
        className={cn(
          'relative z-10 flex h-[min(92dvh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl',
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="board-code-editor-title" className="text-sm font-semibold text-slate-900 sm:text-base">
              Code-Editor (Admin)
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{titleLine}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!dirty || loading || loadError || saveMutation.isPending}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Speichern
            </Button>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Schließen"
              disabled={saveMutation.isPending}
              onClick={handleTryClose}
            >
              <X size={18} aria-hidden />
            </IconButton>
          </div>
        </div>

        {saveMutation.isError ? (
          <div className="shrink-0 px-4 pt-3 sm:px-5">
            <Alert tone="error">Speichern fehlgeschlagen. Bitte erneut versuchen.</Alert>
          </div>
        ) : null}

        {loadError ? (
          <div className="shrink-0 px-4 pt-3 sm:px-5">
            <Alert tone="error">Board konnte nicht geladen werden.</Alert>
          </div>
        ) : null}

        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 bg-slate-50/60 px-2 pt-2 sm:px-3"
          role="tablist"
          aria-label="Quellcode-Ansicht"
        >
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                title={t.hint}
                disabled={loading || loadError}
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-t-lg border border-b-0 px-3 py-2 text-xs font-semibold transition sm:text-[13px]',
                  tab === t.id
                    ? 'border-slate-200 bg-white text-indigo-800 shadow-sm'
                    : 'border-transparent bg-transparent text-slate-600 hover:bg-white/80 hover:text-slate-900',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            className="min-h-0 flex-1 overflow-hidden rounded-tr-lg rounded-b-lg border border-slate-200 bg-white shadow-inner"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
          >
            {loading ? (
              <div className="flex h-[min(58dvh,520px)] items-center justify-center text-sm text-slate-500">
                Lade Board …
              </div>
            ) : (
              <div className="relative h-[min(58dvh,520px)] min-h-[240px] w-full">
                <div
                  className={cn(
                    'absolute inset-0 overflow-auto',
                    tab !== 'html' ? 'pointer-events-none invisible' : '',
                  )}
                >
                  <CodeMirror
                    value={html}
                    height="100%"
                    className="h-full min-h-[240px] text-[13px]"
                    theme="light"
                    extensions={extHtml}
                    editable={!saveMutation.isPending}
                    onChange={(v) => setHtml(v)}
                    basicSetup={false}
                  />
                </div>
                <div
                  className={cn(
                    'absolute inset-0 overflow-auto',
                    tab !== 'css' ? 'pointer-events-none invisible' : '',
                  )}
                >
                  <CodeMirror
                    value={css}
                    height="100%"
                    className="h-full min-h-[240px] text-[13px]"
                    theme="light"
                    extensions={extCss}
                    editable={!saveMutation.isPending}
                    onChange={(v) => setCss(v)}
                    basicSetup={false}
                  />
                </div>
                <div
                  className={cn(
                    'absolute inset-0 overflow-auto',
                    tab !== 'javascript' ? 'pointer-events-none invisible' : '',
                  )}
                >
                  <CodeMirror
                    value={javascript}
                    height="100%"
                    className="h-full min-h-[240px] text-[13px]"
                    theme="light"
                    extensions={extJs}
                    editable={!saveMutation.isPending}
                    onChange={(v) => setJavascript(v)}
                    basicSetup={false}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="shrink-0 px-4 py-2.5 text-[11px] leading-snug text-slate-500 sm:px-5">
          Tastatur: Esc schließt nach Bestätigung bei Änderungen. Ordner- und Schüler-Link-Einstellungen bleiben im
          Volleditor.
        </p>
      </div>
    </div>,
    document.body,
  );
}

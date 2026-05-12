import { useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { css as cssLang } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup';
import { Copy } from 'lucide-react';

import { Alert, Button } from '../../../../components/ui';
import { FreeHtmlBoardFrame } from '../../components/free-html/FreeHtmlBoardFrame';
import { isWaBoardSandboxLogPayload } from '../../components/free-html/sandboxConsoleBridge';
import type { DatasetId, LibraryId } from '../../types';
import { BoardShellModal } from './BoardShellModal';

export type BoardCodeEditorTab = 'html' | 'css' | 'javascript';

type AdminLogLine = { id: string; level: 'log' | 'warn' | 'error'; message: string; ts: number };

/** Ein Clipboard-Text mit HTML, CSS und JavaScript in festen Abschnitten (z. B. für externe Tools / Backups). */
export function formatFullBoardClipboardBundle(htmlPart: string, cssPart: string, jsPart: string): string {
  const block = (title: string, body: string) => `=== ${title} ===\n\n${body ?? ''}`;
  return [block('HTML', htmlPart), block('CSS', cssPart), block('JAVASCRIPT', jsPart)].join('\n\n');
}

export function BoardCodeEditorModal({
  open,
  onClose,
  initialHtml,
  initialCss,
  initialJavascript,
  onSave,
  savePending,
  saveError,
  showAdminSandboxConsole = false,
  usedLibraries = [],
  usedDatasets,
  scriptsEnabled = true,
}: {
  open: boolean;
  onClose: () => void;
  initialHtml: string;
  initialCss: string;
  initialJavascript: string;
  onSave: (payload: { html: string; css: string; javascript: string }) => void;
  savePending: boolean;
  saveError: string | null;
  /** Nur Staff/Superuser: Live-Vorschau + Konsole für Sandbox-Fehlerausgaben. */
  showAdminSandboxConsole?: boolean;
  usedLibraries?: LibraryId[];
  usedDatasets?: DatasetId[];
  scriptsEnabled?: boolean;
}) {
  const [tab, setTab] = useState<BoardCodeEditorTab>('html');
  const [draftHtml, setDraftHtml] = useState('');
  const [draftCss, setDraftCss] = useState('');
  const [draftJs, setDraftJs] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'done' | 'fail'>('idle');
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sandboxLogToken, setSandboxLogToken] = useState('');
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adminLogLines, setAdminLogLines] = useState<AdminLogLine[]>([]);
  const sandboxIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftHtml(initialHtml ?? '');
    setDraftCss(initialCss ?? '');
    setDraftJs(initialJavascript ?? '');
    setTab('html');
    setCopyStatus('idle');
    setAdminLogLines([]);
    setSandboxLogToken(
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    if (copyResetRef.current) {
      clearTimeout(copyResetRef.current);
      copyResetRef.current = null;
    }
  }, [open, initialHtml, initialCss, initialJavascript]);

  useEffect(() => {
    if (!showAdminSandboxConsole || !open) return;
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => {
      previewDebounceRef.current = null;
      setPreviewReloadKey((k) => k + 1);
    }, 450);
    return () => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = null;
      }
    };
  }, [showAdminSandboxConsole, open, draftHtml, draftCss, draftJs]);

  useEffect(() => {
    if (!showAdminSandboxConsole || !open || !sandboxLogToken) return;
    const token = sandboxLogToken;
    const onMessage = (ev: MessageEvent) => {
      if (!isWaBoardSandboxLogPayload(ev.data) || ev.data.token !== token) return;
      if (sandboxIframeRef.current?.contentWindow == null) return;
      if (ev.source !== sandboxIframeRef.current.contentWindow) return;
      setAdminLogLines((prev) => {
        const line: AdminLogLine = {
          id: `${ev.data.ts}-${prev.length}-${Math.random().toString(36).slice(2, 8)}`,
          level: ev.data.level,
          message: ev.data.message,
          ts: ev.data.ts,
        };
        return [...prev, line].slice(-250);
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [showAdminSandboxConsole, open, sandboxLogToken]);

  const tabBtn =
    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1';
  const tabActive = 'bg-slate-900 text-white shadow-sm';
  const tabIdle = 'bg-slate-100 text-slate-700 hover:bg-slate-200';

  const editorHeight = showAdminSandboxConsole ? 'min(40dvh, 360px)' : 'min(62dvh, 520px)';

  const handleClose = () => {
    if (savePending) return;
    onClose();
  };

  const handleCopyAll = async () => {
    const text = formatFullBoardClipboardBundle(draftHtml, draftCss, draftJs);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('done');
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopyStatus('idle'), 2200);
    } catch {
      setCopyStatus('fail');
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopyStatus('idle'), 3500);
    }
  };

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  return (
    <BoardShellModal
      open={open}
      title="Board-Code bearbeiten"
      onClose={handleClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={savePending}
              className="!px-2 sm:!px-3"
              aria-label="HTML, CSS und JavaScript zusammen in die Zwischenablage kopieren"
              onClick={() => void handleCopyAll()}
            >
              <Copy size={14} className="sm:mr-1" aria-hidden />
              <span className="hidden sm:inline">Alles kopieren</span>
              <span className="sm:hidden">Kopieren</span>
            </Button>
            {copyStatus === 'done' ? (
              <span className="text-xs font-medium text-emerald-700">In Zwischenablage kopiert.</span>
            ) : null}
            {copyStatus === 'fail' ? (
              <span className="text-xs font-medium text-red-700">Kopieren nicht möglich (Berechtigung?).</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="secondary" disabled={savePending} onClick={handleClose}>
              Abbrechen
            </Button>
            <Button
              type="button"
              loading={savePending}
              disabled={savePending}
              onClick={() =>
                onSave({
                  html: draftHtml,
                  css: draftCss,
                  javascript: draftJs,
                })
              }
            >
              Speichern
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-600">
          Direkte Bearbeitung von HTML, CSS und JavaScript. Ungültige oder blockierte Muster werden beim
          Speichern vom Server abgelehnt.
        </p>

        {saveError ? <Alert tone="error">{saveError}</Alert> : null}

        <div
          role="tablist"
          aria-label="Code-Ansicht"
          className="flex flex-wrap gap-1 border-b border-slate-200 pb-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'html'}
            className={`${tabBtn} ${tab === 'html' ? tabActive : tabIdle}`}
            onClick={() => setTab('html')}
          >
            HTML
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'css'}
            className={`${tabBtn} ${tab === 'css' ? tabActive : tabIdle}`}
            onClick={() => setTab('css')}
          >
            CSS
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'javascript'}
            className={`${tabBtn} ${tab === 'javascript' ? tabActive : tabIdle}`}
            onClick={() => setTab('javascript')}
          >
            JavaScript
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-inner">
          {tab === 'html' ? (
            <CodeMirror
              value={draftHtml}
              height={editorHeight}
              theme="light"
              extensions={[basicSetup(), html()]}
              onChange={setDraftHtml}
              className="text-sm"
            />
          ) : null}
          {tab === 'css' ? (
            <CodeMirror
              value={draftCss}
              height={editorHeight}
              theme="light"
              extensions={[basicSetup(), cssLang()]}
              onChange={setDraftCss}
              className="text-sm"
            />
          ) : null}
          {tab === 'javascript' ? (
            <CodeMirror
              value={draftJs}
              height={editorHeight}
              theme="light"
              extensions={[basicSetup(), javascript()]}
              onChange={setDraftJs}
              className="text-sm"
            />
          ) : null}
        </div>

        {showAdminSandboxConsole ? (
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
            <p className="text-xs font-medium text-slate-700">
              Live-Vorschau und Sandbox-Konsole (nur für Administratoren)
            </p>
            <FreeHtmlBoardFrame
              html={draftHtml}
              css={draftCss}
              javascript={draftJs}
              scriptsEnabled={scriptsEnabled}
              reloadKey={previewReloadKey}
              boardFrameId="code-editor-preview"
              usedLibraries={usedLibraries}
              usedDatasets={usedDatasets}
              forwardConsoleToParent
              sandboxLogToken={sandboxLogToken}
              iframeRef={sandboxIframeRef}
              className="max-h-[min(42dvh,380px)]"
            />
            <div
              className="flex min-h-[132px] max-h-[200px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 ring-1 ring-slate-800"
              aria-label="Sandbox-Konsole"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-2 py-1.5">
                <span className="text-xs font-medium text-slate-200">Konsolen- und Laufzeitfehler</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="!text-slate-300 hover:!bg-slate-800"
                  onClick={() => setAdminLogLines([])}
                >
                  Leeren
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed text-slate-200">
                {adminLogLines.length === 0 ? (
                  <span className="text-slate-500">Noch keine Ausgabe — Fehler und console.* erscheinen hier.</span>
                ) : (
                  <ul className="space-y-1">
                    {adminLogLines.map((line) => (
                      <li
                        key={line.id}
                        className={
                          line.level === 'error'
                            ? 'text-red-300'
                            : line.level === 'warn'
                              ? 'text-amber-200'
                              : 'text-slate-300'
                        }
                      >
                        <span className="text-slate-500">
                          [{new Date(line.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]{' '}
                        </span>
                        {line.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </BoardShellModal>
  );
}

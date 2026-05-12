import { useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { css as cssLang } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup';
import { Copy } from 'lucide-react';

import { Alert, Button } from '../../../../components/ui';
import { BoardShellModal } from './BoardShellModal';

export type BoardCodeEditorTab = 'html' | 'css' | 'javascript';

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
}: {
  open: boolean;
  onClose: () => void;
  initialHtml: string;
  initialCss: string;
  initialJavascript: string;
  onSave: (payload: { html: string; css: string; javascript: string }) => void;
  savePending: boolean;
  saveError: string | null;
}) {
  const [tab, setTab] = useState<BoardCodeEditorTab>('html');
  const [draftHtml, setDraftHtml] = useState('');
  const [draftCss, setDraftCss] = useState('');
  const [draftJs, setDraftJs] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'done' | 'fail'>('idle');
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftHtml(initialHtml ?? '');
    setDraftCss(initialCss ?? '');
    setDraftJs(initialJavascript ?? '');
    setTab('html');
    setCopyStatus('idle');
    if (copyResetRef.current) {
      clearTimeout(copyResetRef.current);
      copyResetRef.current = null;
    }
  }, [open, initialHtml, initialCss, initialJavascript]);

  const tabBtn =
    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1';
  const tabActive = 'bg-slate-900 text-white shadow-sm';
  const tabIdle = 'bg-slate-100 text-slate-700 hover:bg-slate-200';

  const editorHeight = 'min(62dvh, 520px)';

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
      </div>
    </BoardShellModal>
  );
}

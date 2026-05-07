import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui';
import { cn } from '../../lib/cn';

type BoardPreviewPayload = {
  title: string;
  board_type: string;
  html: string;
  css: string;
  javascript: string;
  used_libraries: string[];
  used_datasets: string[];
};

type WorksheetPreviewPayload = {
  title: string;
  subject: string;
  grade: number | null;
  topic: string;
  pattern_key: string | null;
  page_setup: Record<string, unknown>;
  content: Record<string, unknown>;
};

export type BackofficePreviewTarget = { kind: 'board' | 'worksheet'; id: string };

type TabBoard = 'html' | 'css' | 'javascript' | 'meta';

export function BackofficeSourcePreviewModal({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: BackofficePreviewTarget | null;
  onClose: () => void;
}) {
  const [boardTab, setBoardTab] = useState<TabBoard>('html');

  useEffect(() => {
    if (open && target?.kind === 'board') {
      setBoardTab('html');
    }
  }, [open, target?.id, target?.kind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const query = useQuery({
    queryKey: ['backoffice', 'preview', target?.kind, target?.id],
    queryFn: async () => {
      if (!target) throw new Error('missing target');
      if (target.kind === 'board') {
        return {
          kind: 'board' as const,
          data: (await api.get<BoardPreviewPayload>(`/auth/backoffice/boards/${target.id}/preview/`)).data,
        };
      }
      return {
        kind: 'worksheet' as const,
        data: (await api.get<WorksheetPreviewPayload>(`/auth/backoffice/worksheets/${target.id}/preview/`)).data,
      };
    },
    enabled: open && Boolean(target?.id),
  });

  if (!open || !target) return null;

  const bodyMax = 'max-h-[min(60vh,520px)]';

  const sheetJson =
    query.data?.kind === 'worksheet'
      ? JSON.stringify(query.data.data.content ?? {}, null, 2)
      : '';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="backoffice-source-preview-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 id="backoffice-source-preview-title" className="text-base font-semibold text-slate-900">
              Quelltext vor Freigabe
            </h2>
            <p className="text-[13px] text-slate-500">
              {target.kind === 'board' ? 'Smartboard (HTML/CSS/JS)' : 'Arbeitsblatt (JSON-Inhalt)'}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Schließen">
            <X size={18} aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {query.isPending ? (
            <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Lade Quelldaten…
            </div>
          ) : query.isError ? (
            <p className="text-sm text-red-600">
              Die Quellen konnten nicht geladen werden (nur ausstehende Einreichungen).
            </p>
          ) : query.data?.kind === 'board' ? (
            <>
              <p className="mb-3 text-sm text-slate-700">
                <span className="font-medium">{query.data.data.title || 'Ohne Titel'}</span>
                <span className="text-slate-400"> · </span>
                <span className="text-slate-500">{query.data.data.board_type}</span>
              </p>
              <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                {(
                  [
                    ['html', 'HTML'],
                    ['css', 'CSS'],
                    ['javascript', 'JavaScript'],
                    ['meta', 'Bibliotheken'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setBoardTab(k)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                      boardTab === k
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <pre
                className={cn(
                  'mt-3 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800',
                  bodyMax,
                  boardTab === 'meta' && 'whitespace-pre-wrap',
                )}
              >
                {boardTab === 'html'
                  ? query.data.data.html || '(leer)'
                  : boardTab === 'css'
                    ? query.data.data.css || '(leer)'
                    : boardTab === 'javascript'
                      ? query.data.data.javascript || '(leer)'
                      : [
                          'Eingebundene Bibliotheken:',
                          (query.data.data.used_libraries?.length ?? 0) > 0
                            ? query.data.data.used_libraries.join(', ')
                            : '(keine)',
                          '',
                          'Datensätze:',
                          (query.data.data.used_datasets?.length ?? 0) > 0
                            ? query.data.data.used_datasets.join(', ')
                            : '(keine)',
                        ].join('\n')}
              </pre>
            </>
          ) : (
            <>
              <dl className="mb-3 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Titel</dt>
                  <dd>{query.data.data.title}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fach / Klasse</dt>
                  <dd>
                    {query.data.data.subject || '—'}
                    {query.data.data.grade != null ? ` · Klasse ${query.data.data.grade}` : ''}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Thema</dt>
                  <dd>{query.data.data.topic || '—'}</dd>
                </div>
                {query.data.data.pattern_key ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Vorlage</dt>
                    <dd>{query.data.data.pattern_key}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mb-2 text-[12px] font-medium text-slate-600">Inhalt (JSON)</p>
              <pre
                className={cn(
                  'overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words',
                  bodyMax,
                )}
              >
                {sheetJson}
              </pre>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-3">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
            Schließen
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

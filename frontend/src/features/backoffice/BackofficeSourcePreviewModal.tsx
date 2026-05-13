import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Download, Loader2, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui';
import { cn } from '../../lib/cn';
import type { Worksheet } from '../../types';
import type { DatasetId, LibraryId } from '../boards/types';
import { BoardLibraryLivePreview } from '../boards/components/library/BoardLibraryLivePreview';
import { A4WorksheetRenderer } from '../worksheets/A4WorksheetRenderer';
import { useBackofficeModerationActions } from './useBackofficeModerationActions';

type BoardPreviewPayload = {
  id: string;
  title: string;
  board_type: string;
  subject?: string;
  grade?: string;
  topic?: string;
  owner_label?: string;
  library_listing_description?: string;
  updated_at?: string | null;
  html: string;
  css: string;
  javascript: string;
  used_libraries: LibraryId[];
  used_datasets?: DatasetId[];
};

type WorksheetPreviewPayload = Worksheet & {
  owner_label?: string;
};

export type BackofficePreviewTarget = { kind: 'board' | 'worksheet'; id: string };

type BoardTab = 'preview' | 'html' | 'css' | 'javascript' | 'meta';
type WorksheetTab = 'preview' | 'json' | 'meta';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function BackofficeSourcePreviewModal({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: BackofficePreviewTarget | null;
  onClose: () => void;
}) {
  const [boardTab, setBoardTab] = useState<BoardTab>('preview');
  const [worksheetTab, setWorksheetTab] = useState<WorksheetTab>('preview');
  const [printing, setPrinting] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  const moderation = useBackofficeModerationActions(() => {
    onClose();
  });

  useEffect(() => {
    if (open && target) {
      setBoardTab('preview');
      setWorksheetTab('preview');
    }
  }, [open, target?.id, target?.kind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !printing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, printing]);

  // Print-Mode am body wieder entfernen, sobald der Druckdialog geschlossen wird.
  useEffect(() => {
    const onAfter = () => {
      document.body.classList.remove('ws-backoffice-printing');
      setPrinting(false);
    };
    window.addEventListener('afterprint', onAfter);
    return () => window.removeEventListener('afterprint', onAfter);
  }, []);

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

  const handlePrint = useCallback(() => {
    if (!target || target.kind !== 'worksheet') return;
    setWorksheetTab('preview');
    // React-Render abwarten, dann Print-Mode setzen und drucken.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.add('ws-backoffice-printing');
        setPrinting(true);
        try {
          window.print();
        } catch {
          /* abgebrochen */
        } finally {
          // Fallback: falls afterprint nicht feuert (z. B. abgebrochen ohne Dialog)
          window.setTimeout(() => {
            document.body.classList.remove('ws-backoffice-printing');
            setPrinting(false);
          }, 1500);
        }
      });
    });
  }, [target]);

  const handleConfirmDelete = useCallback(() => {
    if (!target) return;
    if (
      window.confirm(
        target.kind === 'board'
          ? 'Board unwiderruflich löschen?'
          : 'Arbeitsblatt unwiderruflich löschen?',
      )
    ) {
      moderation.destroy.mutate({ kind: target.kind, id: target.id });
    }
  }, [target, moderation.destroy]);

  const worksheetJson = useMemo(() => {
    if (query.data?.kind !== 'worksheet') return '';
    return JSON.stringify(query.data.data.content ?? {}, null, 2);
  }, [query.data]);

  if (!open || !target) return null;

  const isBoard = target.kind === 'board';
  const boardData = query.data?.kind === 'board' ? query.data.data : null;
  const wsData = query.data?.kind === 'worksheet' ? query.data.data : null;

  const codeBoxClass =
    'h-full overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800';

  const tabBtn = (active: boolean) =>
    cn(
      'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
      active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    );

  return createPortal(
    <div
      className="ws-backoffice-print-portal fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-2 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !printing) onClose();
      }}
    >
      <div
        ref={printContainerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backoffice-source-preview-title"
        className="ws-backoffice-print-target flex max-h-[95vh] min-h-[60vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ws-backoffice-print-hide flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 id="backoffice-source-preview-title" className="truncate text-base font-semibold text-slate-900">
              {isBoard
                ? boardData?.title || 'Smartboard prüfen'
                : wsData?.title || 'Arbeitsblatt prüfen'}
            </h2>
            <p className="truncate text-[12px] text-slate-500">
              {isBoard ? (
                <>
                  Smartboard
                  {boardData?.board_type ? ` · ${boardData.board_type}` : ''}
                  {boardData?.subject ? ` · ${boardData.subject}` : ''}
                  {boardData?.grade ? ` · ${boardData.grade}` : ''}
                  {boardData?.owner_label ? ` · ${boardData.owner_label}` : ''}
                </>
              ) : (
                <>
                  Arbeitsblatt
                  {wsData?.subject ? ` · ${wsData.subject}` : ''}
                  {wsData?.grade != null ? ` · Kl. ${wsData.grade}` : ''}
                  {wsData?.pattern_name ? ` · ${wsData.pattern_name}` : ''}
                  {wsData?.owner_label ? ` · ${wsData.owner_label}` : ''}
                </>
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Schließen"
            disabled={printing}
          >
            <X size={18} aria-hidden />
          </Button>
        </div>

        {/* Tabs */}
        <div className="ws-backoffice-print-hide flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-100 px-4 py-2">
          {isBoard ? (
            <>
              <button type="button" className={tabBtn(boardTab === 'preview')} onClick={() => setBoardTab('preview')}>
                Live-Vorschau
              </button>
              <button type="button" className={tabBtn(boardTab === 'html')} onClick={() => setBoardTab('html')}>
                HTML
              </button>
              <button type="button" className={tabBtn(boardTab === 'css')} onClick={() => setBoardTab('css')}>
                CSS
              </button>
              <button
                type="button"
                className={tabBtn(boardTab === 'javascript')}
                onClick={() => setBoardTab('javascript')}
              >
                JavaScript
              </button>
              <button type="button" className={tabBtn(boardTab === 'meta')} onClick={() => setBoardTab('meta')}>
                Metadaten
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={tabBtn(worksheetTab === 'preview')}
                onClick={() => setWorksheetTab('preview')}
              >
                Vorschau (A4)
              </button>
              <button
                type="button"
                className={tabBtn(worksheetTab === 'json')}
                onClick={() => setWorksheetTab('json')}
              >
                JSON-Inhalt
              </button>
              <button
                type="button"
                className={tabBtn(worksheetTab === 'meta')}
                onClick={() => setWorksheetTab('meta')}
              >
                Metadaten
              </button>
            </>
          )}
        </div>

        {/* Body */}
        <div className="relative min-h-0 flex-1 overflow-hidden print:static print:min-h-0 print:flex-none print:overflow-visible">
          {query.isPending ? (
            <div className="ws-backoffice-print-hide flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Lade Quelldaten…
            </div>
          ) : query.isError ? (
            <p className="ws-backoffice-print-hide px-4 py-6 text-sm text-red-600">
              Die Quellen konnten nicht geladen werden (nur ausstehende Einreichungen sind abrufbar).
            </p>
          ) : isBoard && boardData ? (
            <>
              {/* Live-Vorschau (immer gemountet, damit Wechsel schnell ist) */}
              <div
                className={cn(
                  'absolute inset-0 flex min-h-0 flex-col',
                  boardTab === 'preview' ? '' : 'pointer-events-none opacity-0',
                )}
                aria-hidden={boardTab !== 'preview'}
              >
                <BoardLibraryLivePreview
                  boardId={boardData.id}
                  layoutKey={`backoffice-${boardData.id}`}
                  html={boardData.html}
                  css={boardData.css}
                  javascript={boardData.javascript}
                  usedLibraries={boardData.used_libraries ?? []}
                  usedDatasets={boardData.used_datasets}
                />
              </div>

              {boardTab !== 'preview' ? (
                <div className="ws-backoffice-print-hide absolute inset-0 overflow-hidden p-4">
                  {boardTab === 'html' ? (
                    <pre className={codeBoxClass}>{boardData.html || '(leer)'}</pre>
                  ) : boardTab === 'css' ? (
                    <pre className={codeBoxClass}>{boardData.css || '(leer)'}</pre>
                  ) : boardTab === 'javascript' ? (
                    <pre className={codeBoxClass}>{boardData.javascript || '(leer)'}</pre>
                  ) : (
                    <dl className="grid h-full gap-3 overflow-auto pr-1 text-sm text-slate-700 sm:grid-cols-2">
                      <Field label="Titel">{boardData.title || '—'}</Field>
                      <Field label="Board-Typ">{boardData.board_type || '—'}</Field>
                      <Field label="Fach">{boardData.subject || '—'}</Field>
                      <Field label="Klasse">{boardData.grade || '—'}</Field>
                      <Field label="Thema" wide>
                        {boardData.topic || '—'}
                      </Field>
                      <Field label="Eingereicht von">{boardData.owner_label || '—'}</Field>
                      <Field label="Zuletzt geändert">{formatDate(boardData.updated_at)}</Field>
                      <Field label="Beschreibung" wide>
                        {boardData.library_listing_description || '—'}
                      </Field>
                      <Field label="Eingebundene Bibliotheken" wide>
                        {(boardData.used_libraries?.length ?? 0) > 0
                          ? boardData.used_libraries.join(', ')
                          : '(keine)'}
                      </Field>
                      <Field label="Datensätze" wide>
                        {(boardData.used_datasets?.length ?? 0) > 0
                          ? boardData.used_datasets!.join(', ')
                          : '(keine)'}
                      </Field>
                    </dl>
                  )}
                </div>
              ) : null}
            </>
          ) : !isBoard && wsData ? (
            <div className="absolute inset-0 flex min-h-0 flex-col overflow-auto print:static print:inset-auto print:block print:h-auto print:overflow-visible">
              {worksheetTab === 'preview' ? (
                <div className="flex min-h-0 flex-1 justify-center bg-slate-50 px-3 py-4 print:block print:bg-transparent print:p-0">
                  <div className="w-fit max-w-full shrink-0 rounded-lg border border-slate-200 bg-white shadow-sm print:w-full print:max-w-none print:rounded-none print:border-0 print:bg-transparent print:shadow-none">
                    <A4WorksheetRenderer worksheet={wsData} />
                  </div>
                </div>
              ) : worksheetTab === 'json' ? (
                <div className="ws-backoffice-print-hide flex-1 p-4">
                  <pre className={cn(codeBoxClass, 'whitespace-pre-wrap break-words')}>{worksheetJson}</pre>
                </div>
              ) : (
                <div className="ws-backoffice-print-hide p-4">
                  <dl className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                    <Field label="Titel">{wsData.title || '—'}</Field>
                    <Field label="Fach">{wsData.subject || '—'}</Field>
                    <Field label="Klasse">{wsData.grade != null ? `Klasse ${wsData.grade}` : '—'}</Field>
                    <Field label="Thema" wide>
                      {wsData.topic || '—'}
                    </Field>
                    <Field label="Vorlage">{wsData.pattern_name || '—'}</Field>
                    <Field label="Status">{wsData.status || '—'}</Field>
                    <Field label="Eingereicht von">{wsData.owner_label || '—'}</Field>
                    <Field label="Zuletzt geändert">{formatDate(wsData.updated_at)}</Field>
                    <Field label="Bibliothek — Titel" wide>
                      {wsData.library_listing_title || '—'}
                    </Field>
                    <Field label="Bibliothek — Thema" wide>
                      {wsData.library_listing_topic || '—'}
                    </Field>
                    <Field label="Bibliothek — Beschreibung" wide>
                      {wsData.library_listing_description || '—'}
                    </Field>
                  </dl>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer mit Aktionen */}
        <div className="ws-backoffice-print-hide flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {!isBoard ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<Download size={14} aria-hidden />}
                disabled={!wsData || printing}
                onClick={handlePrint}
                title="Druckdialog: A4, Ränder „Keine“, „Als PDF speichern“."
              >
                PDF
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              leftIcon={<Check size={14} aria-hidden />}
              disabled={moderation.busy || query.isPending}
              loading={
                moderation.approve.isPending &&
                moderation.approve.variables?.id === target.id
              }
              onClick={() => moderation.approve.mutate({ kind: target.kind, id: target.id })}
            >
              Freigeben
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<X size={14} aria-hidden />}
              disabled={moderation.busy || query.isPending}
              loading={
                moderation.reject.isPending &&
                moderation.reject.variables?.id === target.id
              }
              onClick={() => moderation.reject.mutate({ kind: target.kind, id: target.id })}
            >
              Ablehnen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-red-700 hover:bg-red-50"
              leftIcon={<Trash2 size={14} aria-hidden />}
              disabled={moderation.busy || query.isPending}
              loading={
                moderation.destroy.isPending &&
                moderation.destroy.variables?.id === target.id
              }
              onClick={handleConfirmDelete}
            >
              Löschen
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={printing}>
              Schließen
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="break-words text-slate-700">{children}</dd>
    </div>
  );
}

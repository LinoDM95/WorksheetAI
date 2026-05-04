import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type SetStateAction } from 'react';
import { useParams } from 'react-router-dom';
import { PanelRight } from 'lucide-react';
import axios from 'axios';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { Worksheet } from '../../types';
import { A4WorksheetRenderer, type PageLayoutOverflowInfo } from './A4WorksheetRenderer';
import { normalizeContentForEdit } from './WorksheetContentEditor';
import { WorksheetEditSidebar } from './WorksheetEditSidebar';
import { EditorToolbar } from './EditorToolbar';

const MAX_DRAFT_UNDO = 10;

function useDominantA4PageInScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  pageCount: number,
  /** Wechsel triggert Neu-Anbindung, sobald die Vorschau im DOM hängt (ref war zuvor null). */
  mountKey: string,
) {
  const [dominantIndex0, setDominantIndex0] = useState(0);

  const recompute = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>('.a4-page[data-a4-page-index]');
    if (els.length === 0) return;

    const rr = root.getBoundingClientRect();
    const centerY = (rr.top + rr.bottom) / 2;
    let bestIdx = 0;
    let bestVis = -1;
    let bestDist = Number.POSITIVE_INFINITY;

    els.forEach((el) => {
      const pr = el.getBoundingClientRect();
      const visTop = Math.max(rr.top, pr.top);
      const visBottom = Math.min(rr.bottom, pr.bottom);
      const visibleH = Math.max(0, visBottom - visTop);
      const raw = el.dataset.a4PageIndex;
      const idx = raw != null && raw !== '' ? Number(raw) : 0;
      const i = Number.isFinite(idx) ? idx : 0;
      const elCenterY = (pr.top + pr.bottom) / 2;
      const dist = Math.abs(elCenterY - centerY);

      if (visibleH > bestVis + 0.5) {
        bestVis = visibleH;
        bestIdx = i;
        bestDist = dist;
      } else if (Math.abs(visibleH - bestVis) <= 0.5 && visibleH > 0 && dist < bestDist) {
        bestIdx = i;
        bestDist = dist;
      }
    });

    setDominantIndex0((prev) => (prev === bestIdx ? prev : bestIdx));
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => recompute());
    };

    schedule();
    root.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(root);

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
    };
  }, [recompute, pageCount, mountKey]);

  useEffect(() => {
    if (pageCount <= 0) return;
    setDominantIndex0((d) => Math.min(Math.max(0, d), pageCount - 1));
  }, [pageCount]);

  return dominantIndex0;
}

export function WorksheetPage() {
  const { id } = useParams();
  const fetchGen = useRef(0);
  const [loading, setLoading] = useState(true);
  const [ws, setWs] = useState<Worksheet | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [previewRm, setPreviewRm] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fetchErr, setFetchErr] = useState('');
  const [regenModalPage, setRegenModalPage] = useState<number | null>(null);
  const [regenInstruction, setRegenInstruction] = useState('');
  const [regenBusyPage, setRegenBusyPage] = useState<number | null>(null);
  const [pageLayoutOverflow, setPageLayoutOverflow] = useState<
    Record<number, { vertical: boolean; horizontal: boolean; px: number }>
  >({});

  const previewScrollRef = useRef<HTMLDivElement>(null);

  const previewPageCountForHook = useMemo(() => {
    if (!ws) return 1;
    const rm = previewRm ?? ((ws.render_model || {}) as Record<string, unknown>);
    const p = rm.pages;
    return Array.isArray(p) && p.length > 0 ? p.length : 1;
  }, [ws, previewRm]);

  const dominantPageMountKey = draft && ws && id ? `e:${id}:${previewPageCountForHook}` : 'idle';

  const dominantPreviewPageIndex0 = useDominantA4PageInScroll(
    previewScrollRef,
    previewPageCountForHook,
    dominantPageMountKey,
  );

  const [editSidebarOpen, setEditSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem('worksheetEditSidebarOpen') !== '0';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('worksheetEditSidebarOpen', editSidebarOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [editSidebarOpen]);

  const draftUndoStackRef = useRef<Record<string, unknown>[]>([]);
  const [, setDraftUndoRerender] = useState(0);

  const clearDraftUndoStack = useCallback(() => {
    draftUndoStackRef.current = [];
    setDraftUndoRerender((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!editSidebarOpen || regenModalPage !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editSidebarOpen, regenModalPage]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setFetchErr('Ungültige Adresse: Es fehlt die Arbeitsblatt-ID.');
      return;
    }
    const gen = ++fetchGen.current;
    setFetchErr('');
    setWs(null);
    setDraft(null);
    clearDraftUndoStack();
    setPreviewRm(null);
    setLoading(true);
    api
      .get(`/worksheets/${id}/`)
      .then((r) => {
        if (fetchGen.current !== gen) return;
        if (String(r.data?.id) !== String(id)) return;
        setWs(r.data as Worksheet);
      })
      .catch((e: unknown) => {
        if (fetchGen.current !== gen) return;
        let msg = 'Arbeitsblatt konnte nicht geladen werden.';
        if (axios.isAxiosError(e)) {
          const st = e.response?.status;
          const d = e.response?.data as { detail?: string } | undefined;
          if (typeof d?.detail === 'string') msg = d.detail;
          else if (st === 404) msg = 'Dieses Arbeitsblatt existiert nicht oder du hast keinen Zugriff.';
          else if (e.code === 'ECONNABORTED' || e.message?.includes('timeout'))
            msg = 'Zeitüberschreitung beim Laden. Bitte erneut versuchen oder ein kleineres Arbeitsblatt öffnen.';
        }
        setFetchErr(msg);
        setWs(null);
      })
      .finally(() => {
        if (fetchGen.current === gen) setLoading(false);
      });
  }, [id, clearDraftUndoStack]);

  useEffect(() => {
    if (!draft || !id) return;
    const t = window.setTimeout(() => {
      api
        .post(`/worksheets/${id}/preview-render/`, { content: draft })
        .then((r) => {
          setPreviewRm(r.data.render_model);
          const next = r.data.content;
          if (next && typeof next === 'object') {
            const pagesBefore = JSON.stringify(draft.pages ?? null);
            const pagesAfter = JSON.stringify((next as { pages?: unknown }).pages ?? null);
            if (pagesBefore !== pagesAfter) {
              setDraft(next as Record<string, unknown>);
            }
          }
        })
        .catch(() => setPreviewRm(null));
    }, 380);
    return () => window.clearTimeout(t);
  }, [draft, id]);

  useEffect(() => {
    if (!ws) return;
    const rm = (previewRm || ws.render_model || {}) as Record<string, unknown>;
    const pages = rm.pages;
    const n = Array.isArray(pages) ? pages.length : 0;
    setPageLayoutOverflow((prev) => {
      if (n === 0 && Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        const i = Number(k);
        if (i >= n) {
          delete next[i];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [previewRm, ws]);

  useEffect(() => {
    if (!ws || id == null) return;
    if (String(ws.id) !== String(id)) return;
    try {
      setDraft(normalizeContentForEdit(ws.content as Record<string, unknown>));
      setPreviewRm((ws.render_model || null) as Record<string, unknown> | null);
      setPageLayoutOverflow({});
      setErr('');
      clearDraftUndoStack();
    } catch {
      setFetchErr(
        'Der Inhalt konnte nicht aufbereitet werden (sehr großes Blatt oder beschädigte Daten). Speichere ein Backup und kontaktiere den Support.',
      );
    }
  }, [id, ws, clearDraftUndoStack]);

  const discardUnsavedChanges = () => {
    if (!ws) return;
    clearDraftUndoStack();
    setDraft(normalizeContentForEdit(ws.content as Record<string, unknown>));
    setPreviewRm((ws.render_model || null) as Record<string, unknown> | null);
    setPageLayoutOverflow({});
    setErr('');
    setRegenModalPage(null);
    setRegenInstruction('');
    setRegenBusyPage(null);
  };

  const save = async () => {
    if (!ws || !id || !draft) return;
    setSaving(true);
    setErr('');
    try {
      const r = await api.patch(`/worksheets/${id}/`, { content: draft });
      setWs(r.data);
      clearDraftUndoStack();
      setDraft(normalizeContentForEdit(r.data.content as Record<string, unknown>));
      setPreviewRm((r.data.render_model || null) as Record<string, unknown> | null);
      setPageLayoutOverflow({});
    } catch (e: unknown) {
      const m = e as { response?: { data?: { detail?: string } } };
      setErr(m.response?.data?.detail || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const handleDraftFromSheet = useCallback((action: SetStateAction<Record<string, unknown>>) => {
    setDraft((prev) => {
      const base = (prev ?? {}) as Record<string, unknown>;
      const next =
        typeof action === 'function'
          ? (action as (b: Record<string, unknown>) => Record<string, unknown>)(base)
          : action;
      try {
        if (prev != null && JSON.stringify(prev) !== JSON.stringify(next)) {
          draftUndoStackRef.current = [
            ...draftUndoStackRef.current,
            JSON.parse(JSON.stringify(prev)) as Record<string, unknown>,
          ].slice(-MAX_DRAFT_UNDO);
        }
      } catch {
        /* ignore compare/clone errors */
      }
      return next;
    });
  }, []);

  const handleDraftUndo = useCallback(() => {
    const stack = draftUndoStackRef.current;
    if (stack.length === 0) return;
    const snapshot = stack.pop()!;
    setDraft(JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>);
  }, []);

  const canDraftUndo = draftUndoStackRef.current.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (draftUndoStackRef.current.length === 0) return;
      e.preventDefault();
      handleDraftUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleDraftUndo]);

  const handlePageLayoutOverflow = useCallback((info: PageLayoutOverflowInfo) => {
    setPageLayoutOverflow((prev) => ({
      ...prev,
      [info.pageIndex]: {
        vertical: info.overflowsVertical,
        horizontal: info.overflowsHorizontal,
        px: info.overflowPxVertical,
      },
    }));
  }, []);

  const hasUnsavedChanges = useMemo(() => {
    if (!ws || !draft) return false;
    try {
      return JSON.stringify(draft) !== JSON.stringify(normalizeContentForEdit(ws.content as Record<string, unknown>));
    } catch {
      return false;
    }
  }, [draft, ws]);

  if (fetchErr) {
    return (
      <div className="no-print mx-auto max-w-lg p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {fetchErr}
        </div>
      </div>
    );
  }
  if (loading || !ws) {
    return (
      <div className="flex flex-col gap-2 p-6 text-slate-600">
        <p>Lade…</p>
        <p className="text-xs text-slate-500">
          Große Arbeitsblätter können einige Sekunden brauchen. Bei hartem Hängen: Seite neu laden oder Backend
          (Django) neu starten.
        </p>
      </div>
    );
  }
  if (!draft)
    return <p className="p-6 text-slate-600">Arbeitsblatt wird vorbereitet…</p>;

  const displayRm = previewRm ?? ((ws.render_model || {}) as Record<string, unknown>);

  const viewWorksheet: Worksheet = {
    ...ws,
    title: String(draft.title ?? ws.title) as string,
    render_model: displayRm,
  };

  const validationErrorsRaw = (draft as { validation_errors?: unknown[] }).validation_errors;
  const validationErrors =
    Array.isArray(validationErrorsRaw) && validationErrorsRaw.length > 0
      ? validationErrorsRaw
      : Array.isArray((ws.content as { validation_errors?: unknown[] })?.validation_errors)
        ? (ws.content as { validation_errors: unknown[] }).validation_errors
        : [];

  const handleOpenRegenPage = (pageIndex: number) => {
    setRegenInstruction('');
    setRegenModalPage(pageIndex);
  };

  const handleCloseRegenModal = () => {
    if (regenBusyPage !== null) return;
    setRegenModalPage(null);
    setRegenInstruction('');
  };

  const handleConfirmRegenPage = async () => {
    if (!id || !draft || regenModalPage === null) return;
    setRegenBusyPage(regenModalPage);
    setErr('');
    try {
      const r = await api.post(`/worksheets/${id}/regenerate-page/`, {
        page_index: regenModalPage,
        teacher_instruction: regenInstruction.trim(),
        content: draft,
      });
      clearDraftUndoStack();
      setDraft(r.data.content);
      setPreviewRm(r.data.render_model);
      setRegenModalPage(null);
      setRegenInstruction('');
    } catch (e: unknown) {
      const m = e as { response?: { data?: { detail?: string } } };
      setErr(m.response?.data?.detail || 'Seiten-Neugenerierung fehlgeschlagen.');
    } finally {
      setRegenBusyPage(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-app)] print:h-auto print:min-h-0 print:flex-none print:bg-white print:overflow-visible">
      {regenModalPage !== null ? (
        <div
          className="no-print fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/45 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="regen-dialog-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCloseRegenModal();
          }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Dialog schließen"
            onClick={handleCloseRegenModal}
          />
          <div
            className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="regen-dialog-title" className="text-base font-semibold text-slate-900">
              Seite {regenModalPage + 1} mit KI neu gestalten
            </h2>
            <p className="mt-1 text-xs leading-snug text-slate-600">
              Es wird <strong>nur diese eine Seite</strong> ersetzt (Rest bleibt). Optional: Wünsche zur Struktur oder zum Schwierigkeitsgrad.
            </p>
            <label className="mt-3 block text-xs font-medium text-slate-700" htmlFor="regen-instruction">
              Anweisung an die KI (optional)
            </label>
            <textarea
              id="regen-instruction"
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              rows={3}
              maxLength={4000}
              disabled={regenBusyPage !== null}
              placeholder="z. B. mehr Übungsaufgaben, weniger Text, andere Aufgabenstellung …"
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:bg-slate-50"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={regenBusyPage !== null}
                onClick={handleCloseRegenModal}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={regenBusyPage !== null}
                onClick={() => void handleConfirmRegenPage()}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {regenBusyPage !== null ? 'KI arbeitet…' : 'Seite neu generieren'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="no-print relative z-[45] shrink-0">
        <EditorToolbar
          title={String(draft.title ?? ws.title)}
          subject={ws.subject}
          grade={ws.grade}
          saving={saving}
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={() => void save()}
          editSidebarOpen={editSidebarOpen}
          onToggleEditSidebar={() => setEditSidebarOpen((o) => !o)}
          onUndo={handleDraftUndo}
          canUndo={canDraftUndo}
          statusLabel={
            ws.updated_at ? `Zuletzt geändert ${new Date(String(ws.updated_at)).toLocaleString('de-DE')}` : undefined
          }
        />
      </div>

      <div className="relative z-0 flex min-h-0 flex-1 flex-col print:h-auto print:min-h-0 print:overflow-visible">
        <div
          className={cn(
            'relative flex min-h-0 flex-1 flex-col overflow-hidden print:h-auto print:overflow-visible',
          )}
        >
          <div
            ref={previewScrollRef}
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain px-3 pb-16 pt-4 sm:px-5 print:overflow-visible print:pb-0 print:pt-0 transition-[padding] duration-300 ease-out',
              editSidebarOpen && 'lg:pr-[min(40rem,calc(100vw-0.5rem))]',
            )}
          >
            <div className="print:block">
              <div className="flex min-h-0 min-w-0 justify-center print:block print:w-full print:justify-start">
                <div className="w-full max-w-full shrink-0 overflow-x-auto overflow-y-visible rounded-lg border border-slate-200 bg-white shadow-sm lg:mx-auto lg:w-fit lg:max-w-full print:mx-0 print:max-w-none print:w-full print:min-w-0 print:overflow-visible print:border-0 print:rounded-none print:bg-transparent print:shadow-none">
                  <A4WorksheetRenderer
                    worksheet={viewWorksheet}
                    showGuide={false}
                    onPageLayoutOverflow={handlePageLayoutOverflow}
                  />
                </div>
              </div>
            </div>

            {validationErrors.length > 0 ? (
              <div className="no-print mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <b>Validierungswarnungen</b>
                <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(validationErrors, null, 2)}</pre>
              </div>
            ) : null}
          </div>

          {editSidebarOpen ? (
            <button
              type="button"
              className="no-print absolute inset-0 z-[30] bg-[var(--color-ink-900)]/25 backdrop-blur-[1px] lg:hidden"
              aria-label="Bearbeitungs-Sidebar schließen"
              onClick={() => setEditSidebarOpen(false)}
            />
          ) : null}

          {previewPageCountForHook > 1 ? (
            <div
              className="no-print pointer-events-none absolute bottom-6 left-1/2 z-[25] -translate-x-1/2 select-none"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label={`Vorschau: Seite ${dominantPreviewPageIndex0 + 1} von ${previewPageCountForHook}`}
            >
              <span className="rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-violet-900 shadow-md tabular-nums ring-1 ring-violet-300/90 backdrop-blur-sm sm:text-sm">
                Seite {dominantPreviewPageIndex0 + 1} von {previewPageCountForHook}
              </span>
            </div>
          ) : null}

          <div className="no-print pointer-events-none absolute inset-y-0 right-0 z-40 w-[min(100%,40rem)] max-w-[100vw] overflow-hidden print:hidden">
            <div
              className={cn(
                'pointer-events-auto flex h-full min-h-0 w-full flex-col border-l-[3px] border-l-[var(--color-primary-200)] border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[-16px_0_48px_-12px_rgba(15,23,42,0.2)] transition-transform duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]',
                editSidebarOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none',
              )}
            >
              <WorksheetEditSidebar
                draft={draft}
                setDraft={handleDraftFromSheet}
                displayTitle={String(draft.title ?? ws.title)}
                err={err}
                onRequestRegeneratePage={handleOpenRegenPage}
                regeneratePageBusyIndex={regenBusyPage}
                pageLayoutOverflow={pageLayoutOverflow}
                onRequestClose={() => setEditSidebarOpen(false)}
              />
            </div>
          </div>

          <button
            type="button"
            className={cn(
              'no-print absolute right-0 top-1/2 z-[38] flex items-center gap-2 rounded-l-[var(--radius-lg)] border border-r-0 border-[var(--color-border)] bg-[var(--color-bg-card)] py-2.5 pl-3 pr-2 shadow-[var(--shadow-lg)] transition-transform duration-300 ease-out hover:bg-[var(--color-ink-50)] print:hidden',
              editSidebarOpen && 'pointer-events-none opacity-0',
            )}
            style={{
              transform: editSidebarOpen ? 'translate(100%, -50%)' : 'translateY(-50%)',
            }}
            onClick={() => setEditSidebarOpen(true)}
            aria-label="Bearbeitungs-Sidebar öffnen"
          >
            <PanelRight size={18} className="shrink-0 text-[var(--color-primary-600)]" aria-hidden />
            <span className="text-xs font-semibold text-[var(--color-ink-800)]">Bearbeitung</span>
          </button>
        </div>
      </div>
    </div>
  );
}

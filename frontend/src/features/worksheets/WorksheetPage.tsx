import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { Alert, Button, IconButton, SectionCard } from '../../components/ui';
import { ResizableEditorDock } from '../../components/ResizableEditorDock';
import { useResizableEditorDock } from '../../lib/useResizableEditorDock';
import { WORKSHEET_LIST_QUERY_KEY, worksheetsLibraryQueryKey } from '../../lib/listQueries';
import { useAuth } from '../../lib/authContext';

const MAX_DRAFT_UNDO = 10;

const StringList = ({ label, items }: { label: string; items?: unknown }) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  const strings = items.filter((x): x is string => typeof x === 'string');
  if (strings.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
        {strings.map((s, i) => (
          <li key={`${i}-${s.slice(0, 48)}`}>{s}</li>
        ))}
      </ul>
    </div>
  );
};

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
  const [showCurriculumWizardHint, setShowCurriculumWizardHint] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);

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

  const [mobileEditOpen, setMobileEditOpen] = useState(() => {
    try {
      return localStorage.getItem('worksheetEditSidebarOpen') !== '0';
    } catch {
      return true;
    }
  });

  const editDock = useResizableEditorDock({
    widthStorageKey: 'worksheet-edit-dock-width',
    collapsedStorageKey: 'worksheet-edit-dock-collapsed',
    minWidth: 280,
    maxWidth: 640,
    defaultWidth: 400,
    initialCollapsed:
      typeof window !== 'undefined' && localStorage.getItem('worksheetEditSidebarOpen') === '0',
  });

  const sidebarChromeOpen = editDock.isLgViewport ? !editDock.collapsed : mobileEditOpen;
  const [previewScrollPadTransition, setPreviewScrollPadTransition] = useState(false);
  const prevEditSidebarOpenRef = useRef(sidebarChromeOpen);

  useEffect(() => {
    if (prevEditSidebarOpenRef.current === sidebarChromeOpen) return;
    prevEditSidebarOpenRef.current = sidebarChromeOpen;
    setPreviewScrollPadTransition(true);
    const t = window.setTimeout(() => setPreviewScrollPadTransition(false), 320);
    return () => window.clearTimeout(t);
  }, [sidebarChromeOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('worksheetEditSidebarOpen', mobileEditOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [mobileEditOpen]);

  const handleToggleEditSidebar = () => {
    if (editDock.isLgViewport) {
      editDock.setCollapsed((c) => !c);
    } else {
      setMobileEditOpen((o) => !o);
    }
  };

  const draftUndoStackRef = useRef<Record<string, unknown>[]>([]);
  const [, setDraftUndoRerender] = useState(0);

  const clearDraftUndoStack = useCallback(() => {
    draftUndoStackRef.current = [];
    setDraftUndoRerender((n) => n + 1);
  }, []);

  useEffect(() => {
    if (regenModalPage !== null) return;
    if (!sidebarChromeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editDock.isLgViewport) {
        editDock.setCollapsed(true);
      } else {
        setMobileEditOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarChromeOpen, regenModalPage, editDock.isLgViewport]);

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
    if (!id || !ws) return;
    const k = `worksheet-curriculum-hint:${id}`;
    try {
      if (sessionStorage.getItem(k)) {
        sessionStorage.removeItem(k);
        setShowCurriculumWizardHint(true);
      }
    } catch {
      /* ignore storage errors */
    }
  }, [id, ws]);

  useEffect(() => {
    if (!draft || !id) return;
    if (ws?.viewer_is_owner === false) return;
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
  }, [draft, id, ws?.viewer_is_owner]);

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
    if (!ws || !id || !draft || ws.viewer_is_owner === false) return;
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
    const pxTol = 1;
    setPageLayoutOverflow((prev) => {
      const cur = prev[info.pageIndex];
      const nextPx = Math.round(info.overflowPxVertical);
      if (
        cur &&
        cur.vertical === info.overflowsVertical &&
        cur.horizontal === info.overflowsHorizontal &&
        Math.abs(Math.round(cur.px) - nextPx) <= pxTol
      ) {
        return prev;
      }
      return {
        ...prev,
        [info.pageIndex]: {
          vertical: info.overflowsVertical,
          horizontal: info.overflowsHorizontal,
          px: info.overflowPxVertical,
        },
      };
    });
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

  const isReadOnly = ws.viewer_is_owner === false;

  const libMod = ws.library_moderation_status ?? 'none';
  const libListed = ws.library_public === true && libMod === 'approved';
  const libraryButtonLabel = user?.is_staff
    ? ws.library_public
      ? 'Aus öffentlicher Bibliothek nehmen'
      : 'In öffentliche Bibliothek legen'
    : libMod === 'pending'
      ? 'Einreichung zurückziehen'
      : libListed
        ? 'Aus öffentlicher Bibliothek nehmen'
        : 'Zur Freigabe einreichen';

  const handleLibraryToggle = async () => {
    if (!id || isReadOnly || !ws) return;
    const mod = ws.library_moderation_status ?? 'none';
    const listed = ws.library_public === true && mod === 'approved';

    const runPatch = async (body: { library_public: boolean }) => {
      setLibraryBusy(true);
      setErr('');
      try {
        const r = await api.patch<Worksheet>(`/worksheets/${id}/`, body);
        setWs(r.data);
        void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('all') });
        void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('mine') });
        void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      } catch (e: unknown) {
        const m = e as { response?: { data?: { detail?: string } } };
        setErr(m.response?.data?.detail ?? 'Bibliotheks-Einstellung konnte nicht gespeichert werden.');
      } finally {
        setLibraryBusy(false);
      }
    };

    if (user?.is_staff) {
      const next = !ws.library_public;
      const ok = next
        ? window.confirm('Dieses Arbeitsblatt öffentlich in der Bibliothek sichtbar machen?')
        : window.confirm('Arbeitsblatt aus der öffentlichen Bibliothek entfernen?');
      if (!ok) return;
      void runPatch({ library_public: next });
      return;
    }

    if (mod === 'pending') {
      if (!window.confirm('Die Einreichung zurückziehen?')) return;
      void runPatch({ library_public: false });
      return;
    }

    if (listed) {
      if (!window.confirm('Arbeitsblatt aus der öffentlichen Bibliothek entfernen?')) return;
      void runPatch({ library_public: false });
      return;
    }

    if (
      !window.confirm(
        'Dieses Arbeitsblatt zur Freigabe einreichen? Sobald eine Administratorin es freigibt, erscheint es in der Bibliothek.',
      )
    ) {
      return;
    }
    void runPatch({ library_public: true });
  };

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

  const curriculumShow = ws.curriculum_show_usage !== false;
  const curriculumPanel = ws.curriculum_usage_panel;

  const handleOpenRegenPage = (pageIndex: number) => {
    if (isReadOnly) return;
    setRegenInstruction('');
    setRegenModalPage(pageIndex);
  };

  const handleCloseRegenModal = () => {
    if (regenBusyPage !== null) return;
    setRegenModalPage(null);
    setRegenInstruction('');
  };

  const handleConfirmRegenPage = async () => {
    if (!id || !draft || regenModalPage === null || isReadOnly) return;
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
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-app)] lg:min-h-0 lg:flex-row print:h-auto print:min-h-0 print:flex-none print:bg-white print:overflow-visible">
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col print:min-h-0 print:flex-none">
        <div className="no-print relative z-[45] shrink-0">
          <EditorToolbar
            title={String(draft.title ?? ws.title)}
            subject={ws.subject}
            grade={ws.grade}
            saving={saving}
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={() => void save()}
            readOnly={isReadOnly}
            editSidebarOpen={sidebarChromeOpen}
            onToggleEditSidebar={isReadOnly ? undefined : handleToggleEditSidebar}
            onUndo={isReadOnly ? undefined : handleDraftUndo}
            canUndo={canDraftUndo}
            statusLabel={
              ws.updated_at
                ? `Zuletzt geändert ${new Date(String(ws.updated_at)).toLocaleString('de-DE')}`
                : undefined
            }
          />
          {!isReadOnly ? (
            <div className="no-print flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 px-4 py-2 sm:px-6">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={libraryBusy}
                onClick={() => void handleLibraryToggle()}
              >
                {libraryButtonLabel}
              </Button>
              {libListed ? (
                <span className="text-[11px] text-[var(--color-ink-500)]">
                  Ist im Reiter „Bibliothek“ unter Arbeitsblätter sichtbar.
                </span>
              ) : !user?.is_staff && libMod === 'pending' ? (
                <span className="text-[11px] text-[var(--color-ink-500)]">
                  Freigabe durch eine Administratorin ausstehend — noch nicht öffentlich.
                </span>
              ) : !user?.is_staff && libMod === 'rejected' ? (
                <span className="text-[11px] text-amber-800">Letzte Einreichung wurde abgelehnt. Du kannst erneut einreichen.</span>
              ) : null}
            </div>
          ) : null}
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
              'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-16 pt-4 sm:px-5 print:overflow-visible print:pb-0 print:pt-0',
              previewScrollPadTransition && 'transition-[padding] duration-300 ease-out',
            )}
          >
            {curriculumShow ? (
              <div className="no-print mx-auto mb-5 w-full max-w-4xl space-y-3">
                {showCurriculumWizardHint ? (
                  <Alert tone="info">
                    Unter „Lehrplanbezug“ siehst du, welche Leitplanken bei der Erstellung berücksichtigt wurden —
                    nur in dieser App sichtbar, nicht im gedruckten PDF.
                  </Alert>
                ) : null}
                <SectionCard
                  title="Lehrplanbezug"
                  description="Orientierung an importierten und geprüften Lehrplan-Kontexten. Keine rechtsverbindliche oder vollständige Abbildung des Rahmenlehrplans."
                  bodyClassName="space-y-3 px-5 py-4"
                >
                  {ws.curriculum_warning ? <Alert tone="warn">{ws.curriculum_warning}</Alert> : null}
                  {curriculumPanel?.has_curriculum_context && curriculumPanel.usage ? (
                    <>
                      <dl className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                        {curriculumPanel.usage.title ? (
                          <>
                            <dt className="font-medium text-slate-500">Bezeichnung</dt>
                            <dd>{curriculumPanel.usage.title}</dd>
                          </>
                        ) : null}
                        {curriculumPanel.usage.source_label ? (
                          <>
                            <dt className="font-medium text-slate-500">Quelle</dt>
                            <dd>{curriculumPanel.usage.source_label}</dd>
                          </>
                        ) : null}
                        <dt className="font-medium text-slate-500">Bundesland / Region</dt>
                        <dd>{curriculumPanel.usage.state ?? '—'}</dd>
                        <dt className="font-medium text-slate-500">Fach</dt>
                        <dd>{curriculumPanel.usage.subject ?? '—'}</dd>
                        <dt className="font-medium text-slate-500">Klassenstufe / Band</dt>
                        <dd>{curriculumPanel.usage.grade_band ?? '—'}</dd>
                        <dt className="font-medium text-slate-500">Themenfeld</dt>
                        <dd className="min-w-0 break-words">{curriculumPanel.usage.topic_area ?? '—'}</dd>
                        <dt className="font-medium text-slate-500">Qualität</dt>
                        <dd>{curriculumPanel.usage.quality_status ?? '—'}</dd>
                        <dt className="font-medium text-slate-500">Match-Score</dt>
                        <dd>
                          {curriculumPanel.usage.match_score != null
                            ? String(curriculumPanel.usage.match_score)
                            : '—'}
                        </dd>
                      </dl>
                      {curriculumPanel.usage.short_description ? (
                        <p className="text-xs leading-snug text-slate-600">{curriculumPanel.usage.short_description}</p>
                      ) : null}
                      <StringList label="Trefferbegründungen" items={curriculumPanel.usage.match_reasons} />
                      <StringList label="Teilbereiche / Unterthemen" items={curriculumPanel.usage.subtopics} />
                      <StringList label="Kompetenzen / Ziele" items={curriculumPanel.usage.competency_goals} />
                      <StringList label="Erlaubte Aufgabentypen" items={curriculumPanel.usage.allowed_task_types} />
                      <StringList label="Validierungsregeln" items={curriculumPanel.usage.validation_rules} />
                      {curriculumPanel.usage.ai_usage_note ? (
                        <p className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                          {curriculumPanel.usage.ai_usage_note}
                        </p>
                      ) : null}
                      {curriculumPanel.usage.curriculum_alignment &&
                      Object.keys(curriculumPanel.usage.curriculum_alignment).length > 0 ? (
                        <details className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                          <summary className="cursor-pointer text-xs font-medium text-slate-700">
                            KI-Zuordnung (technisch)
                          </summary>
                          <pre className="mt-2 max-h-40 overflow-auto text-[11px] text-slate-600">
                            {JSON.stringify(curriculumPanel.usage.curriculum_alignment, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </>
                  ) : curriculumPanel && !curriculumPanel.has_curriculum_context ? (
                    <p className="text-sm text-slate-600">
                      {curriculumPanel.warning ??
                        'Für dieses Arbeitsblatt wurde kein aktiver Lehrplan-Kontext gefunden oder genutzt.'}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">Keine Angaben zum Lehrplanbezug.</p>
                  )}
                </SectionCard>
              </div>
            ) : null}
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

          {!editDock.isLgViewport && mobileEditOpen && !isReadOnly ? (
            <button
              type="button"
              className="no-print absolute inset-0 z-[30] bg-[var(--color-ink-900)]/25 backdrop-blur-[1px] lg:hidden"
              aria-label="Bearbeitungs-Sidebar schließen"
              onClick={() => setMobileEditOpen(false)}
            />
          ) : null}

          {!editDock.isLgViewport && mobileEditOpen && !isReadOnly ? (
            <div className="no-print absolute inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-xl lg:hidden">
              <WorksheetEditSidebar
                draft={draft}
                setDraft={handleDraftFromSheet}
                displayTitle={String(draft.title ?? ws.title)}
                err={err}
                onRequestRegeneratePage={handleOpenRegenPage}
                regeneratePageBusyIndex={regenBusyPage}
                pageLayoutOverflow={pageLayoutOverflow}
                onRequestClose={() => setMobileEditOpen(false)}
              />
            </div>
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

          {!editDock.isLgViewport && !isReadOnly ? (
            <button
              type="button"
              className={cn(
                'no-print absolute right-0 top-1/2 z-[38] flex items-center gap-2 rounded-l-[var(--radius-lg)] border border-r-0 border-[var(--color-border)] bg-[var(--color-bg-card)] py-2.5 pl-3 pr-2 shadow-[var(--shadow-lg)] transition-transform duration-300 ease-out hover:bg-[var(--color-ink-50)] print:hidden lg:hidden',
                mobileEditOpen && 'pointer-events-none opacity-0',
              )}
              style={{
                transform: mobileEditOpen ? 'translate(100%, -50%)' : 'translateY(-50%)',
              }}
              onClick={() => setMobileEditOpen(true)}
              aria-label="Bearbeitungs-Sidebar öffnen"
            >
              <PanelRight size={18} className="shrink-0 text-[var(--color-primary-600)]" aria-hidden />
              <span className="text-xs font-semibold text-[var(--color-ink-800)]">Bearbeitung</span>
            </button>
          ) : null}
        </div>
      </div>
      </div>

      {editDock.isLgViewport && !isReadOnly ? (
        <ResizableEditorDock
          ariaLabel="Struktur bearbeiten"
          title="Bearbeitung"
          dock={editDock}
          asideClassName="border-l-[3px] border-l-[var(--color-primary-200)] border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[-16px_0_48px_-12px_rgba(15,23,42,0.2)]"
          expanded={
            <WorksheetEditSidebar
              draft={draft}
              setDraft={handleDraftFromSheet}
              displayTitle={String(draft.title ?? ws.title)}
              err={err}
              onRequestRegeneratePage={handleOpenRegenPage}
              regeneratePageBusyIndex={regenBusyPage}
              pageLayoutOverflow={pageLayoutOverflow}
              onRequestClose={() => editDock.setCollapsed(true)}
              rootElement="div"
            />
          }
          collapsedRail={
            <IconButton
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              aria-label="Bearbeitung ausklappen"
              title="Bearbeitung"
              onClick={() => editDock.setCollapsed(false)}
            >
              <PanelRight size={18} aria-hidden />
            </IconButton>
          }
        />
      ) : null}
    </div>
  );
}

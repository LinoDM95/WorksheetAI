import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useAiGenerationJobs } from '../../components/ai-generation/AiGenerationJobsContext';
import axios from 'axios';
import { api, LONG_RUNNING_BOARD_TIMEOUT_MS } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { Worksheet } from '../../types';
import { A4WorksheetRenderer, type PageLayoutOverflowInfo } from './A4WorksheetRenderer';
import { normalizeContentForEdit } from './WorksheetContentEditor';
import { WorksheetEditSidebar } from './WorksheetEditSidebar';
import { WorksheetDetailPageHeader } from './WorksheetDetailPageHeader';
import { ResizableEditorDock } from '../../components/ResizableEditorDock';
import { useResizableEditorDock } from '../../lib/useResizableEditorDock';
import { WORKSHEET_LIST_QUERY_KEY, worksheetsLibraryQueryKey } from '../../lib/listQueries';
import { useAuth } from '../../lib/authContext';
import { BoardLibraryPublishModal, type BoardLibraryListingForm } from '../boards/components/BoardLibraryPublishModal';
import { backofficeDeleteWorksheet, backofficeUnpublishWorksheet } from '../boards/boardsApi';
import { useDominantA4PageInScroll } from './useDominantA4PageInScroll';
import { clearPendingFirstOpenWorksheet } from './lib/worksheetFirstOpenHighlight';

const MAX_DRAFT_UNDO = 10;

function formatWorksheetKiApiError(e: unknown, fallback: string): string {
  if (!axios.isAxiosError(e)) return fallback;
  if (!e.response) {
    const m = (e.message || '').toLowerCase();
    if (e.code === 'ECONNABORTED' || m.includes('timeout')) {
      return 'Zeitüberschreitung beim KI-Aufruf. Bitte erneut versuchen oder weniger Seiten gleichzeitig überarbeiten.';
    }
    return 'Netzwerkfehler beim KI-Aufruf. Bitte Verbindung prüfen und erneut versuchen.';
  }
  const data = e.response.data;
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    if (typeof rec.detail === 'string') return rec.detail;
    if (Array.isArray(rec.detail)) return rec.detail.map(String).join(' ');
    const firstVal = Object.values(rec).find((v) => v != null);
    if (typeof firstVal === 'string') return firstVal;
    if (Array.isArray(firstVal)) return firstVal.map(String).join(' ');
  }
  if (typeof e.response.data === 'string' && e.response.data.trim()) {
    return e.response.data.trim().slice(0, 600);
  }
  return fallback;
}

function formatWorksheetApiError(e: unknown): string {
  const data = (e as { response?: { data?: unknown } })?.response?.data;
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    if (typeof rec.detail === 'string') return rec.detail;
    if (Array.isArray(rec.detail)) return rec.detail.map(String).join(' ');
    const firstVal = Object.values(rec).find((v) => v != null);
    if (typeof firstVal === 'string') return firstVal;
    if (Array.isArray(firstVal)) return firstVal.map(String).join(' ');
  }
  return 'Bibliotheks-Einstellung konnte nicht gespeichert werden.';
}

export function WorksheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startJob, updateJob, completeJob, failJob, runSerialized, jobs } = useAiGenerationJobs();
  const worksheetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (id) clearPendingFirstOpenWorksheet(id);
  }, [id]);
  const queryClient = useQueryClient();
  const fetchGen = useRef(0);
  const [loading, setLoading] = useState(true);
  const [ws, setWs] = useState<Worksheet | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [previewRm, setPreviewRm] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [fetchErr, setFetchErr] = useState('');
  const [pageLayoutOverflow, setPageLayoutOverflow] = useState<
    Record<number, { vertical: boolean; horizontal: boolean; px: number }>
  >({});
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryModalMode, setLibraryModalMode] = useState<'publish' | 'edit_listing' | null>(null);
  const [libraryModalError, setLibraryModalError] = useState<string | null>(null);
  const [staffLibBusy, setStaffLibBusy] = useState(false);

  useEffect(() => {
    worksheetIdRef.current = id;
  }, [id]);

  const draftRef = useRef<Record<string, unknown> | null>(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const worksheetPageKiUi = useMemo(() => {
    if (!id) {
      return (_pageIdx: number): { blocking: boolean; queued: boolean } => ({
        blocking: false,
        queued: false,
      });
    }
    return (pageIdx: number): { blocking: boolean; queued: boolean } => {
      const bulk = jobs.find(
        (j) =>
          j.kind === 'worksheet-pages' &&
          j.resourceId === id &&
          (j.status === 'queued' || j.status === 'running'),
      );
      if (bulk) {
        return { blocking: true, queued: bulk.status === 'queued' };
      }
      const hit = jobs.find(
        (j) =>
          j.kind === 'worksheet-page' &&
          j.resourceId === id &&
          j.pageIndex === pageIdx &&
          (j.status === 'queued' || j.status === 'running'),
      );
      if (hit) {
        return { blocking: true, queued: hit.status === 'queued' };
      }
      return { blocking: false, queued: false };
    };
  }, [id, jobs]);

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

  const editDock = useResizableEditorDock({
    widthStorageKey: 'worksheet-edit-dock-width',
    collapsedStorageKey: 'worksheet-edit-dock-collapsed',
    minWidth: 280,
    maxWidth: 640,
    defaultWidth: 400,
    initialCollapsed:
      typeof window !== 'undefined' && localStorage.getItem('worksheetEditSidebarOpen') === '0',
  });

  const sidebarChromeOpen = editDock.isLgViewport && !editDock.collapsed;
  const [previewScrollPadTransition, setPreviewScrollPadTransition] = useState(false);
  const prevEditSidebarOpenRef = useRef(sidebarChromeOpen);

  useEffect(() => {
    if (prevEditSidebarOpenRef.current === sidebarChromeOpen) return;
    prevEditSidebarOpenRef.current = sidebarChromeOpen;
    setPreviewScrollPadTransition(true);
    const t = window.setTimeout(() => setPreviewScrollPadTransition(false), 320);
    return () => window.clearTimeout(t);
  }, [sidebarChromeOpen]);

  const draftUndoStackRef = useRef<Record<string, unknown>[]>([]);
  const [, setDraftUndoRerender] = useState(0);

  const clearDraftUndoStack = useCallback(() => {
    draftUndoStackRef.current = [];
    setDraftUndoRerender((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!sidebarChromeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editDock.isLgViewport) {
        editDock.setCollapsed(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarChromeOpen, editDock.isLgViewport]);

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

  const handleRegenerateWorksheetPage = useCallback(
    async (pageIndex: number, teacherInstruction: string) => {
      if (!id || !draft || !ws || ws.viewer_is_owner === false) return;
      const instruction = teacherInstruction.trim();
      if (!instruction) {
        setErr('Bitte beschreibe, was die KI ändern soll.');
        return;
      }

      const targetWorksheetId = id;
      const titleSnippet = (ws.title || '').trim() || 'Arbeitsblatt';
      const jid = startJob({
        kind: 'worksheet-page',
        title: 'Seite wird überarbeitet',
        subtitle: `${titleSnippet} · Seite ${pageIndex + 1}`,
        resourceId: targetWorksheetId,
        pageIndex,
      });

      await runSerialized(jid, async () => {
        updateJob(jid, { phaseLabel: 'KI überarbeitet die Seite …', progressPercent: 8 });
        setErr('');

        const cur = draftRef.current;
        if (!cur || typeof cur !== 'object') {
          const msg = 'Inhalt konnte nicht für die Überarbeitung gelesen werden.';
          failJob(jid, msg);
          if (worksheetIdRef.current === targetWorksheetId) setErr(msg);
          throw new Error(msg);
        }

        let contentSnapshot: Record<string, unknown>;
        try {
          contentSnapshot = JSON.parse(JSON.stringify(cur)) as Record<string, unknown>;
        } catch {
          const msg = 'Inhalt konnte nicht für die Überarbeitung kopiert werden.';
          failJob(jid, msg);
          if (worksheetIdRef.current === targetWorksheetId) setErr(msg);
          throw new Error(msg);
        }

        let r;
        try {
          r = await api.post(
            `/worksheets/${targetWorksheetId}/regenerate-page/`,
            {
              page_index: pageIndex,
              teacher_instruction: instruction,
              content: contentSnapshot,
            },
            { timeout: LONG_RUNNING_BOARD_TIMEOUT_MS },
          );
        } catch (e: unknown) {
          const msg = formatWorksheetKiApiError(e, 'Seite konnte nicht überarbeitet werden.');
          failJob(jid, msg);
          if (worksheetIdRef.current === targetWorksheetId) {
            setErr(msg);
          }
          throw e;
        }

        updateJob(jid, { progressPercent: 85 });
        const nextContent = normalizeContentForEdit(r.data.content as Record<string, unknown>);

        try {
          const patchResp = await api.patch<Worksheet>(`/worksheets/${targetWorksheetId}/`, {
            content: nextContent,
          });
          if (worksheetIdRef.current === targetWorksheetId) {
            const persistedDraft = normalizeContentForEdit(
              patchResp.data.content as Record<string, unknown>,
            );
            // Wichtig: draftRef synchron aktualisieren, BEVOR der nächste serialisierte
            // Job den Snapshot liest. setDraft schedulet nur einen Re-Render — der
            // useEffect, der draftRef synchronisiert, läuft erst nach dem React-Commit.
            // Wenn der User direkt eine zweite Seite korrigiert, würde dieser Job sonst
            // mit dem alten Stand vor der ersten Korrektur arbeiten und Seite 1
            // ungewollt zurücksetzen.
            draftRef.current = persistedDraft;
            setWs(patchResp.data);
            setDraft(persistedDraft);
            setPreviewRm((patchResp.data.render_model || null) as Record<string, unknown> | null);
            setPageLayoutOverflow({});
            clearDraftUndoStack();
          } else {
            void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
          }
        } catch (e: unknown) {
          const msg =
            'Überarbeitung war erfolgreich, Speichern fehlgeschlagen. Bitte Seite neu laden und erneut speichern.';
          failJob(jid, msg);
          if (worksheetIdRef.current === targetWorksheetId) {
            // Auch hier draftRef synchron mitziehen, damit eine direkt folgende
            // Page-Regeneration auf dem (zumindest lokal) aktuellen Stand aufsetzt.
            draftRef.current = nextContent;
            setDraft(nextContent);
            if (r.data.render_model && typeof r.data.render_model === 'object') {
              setPreviewRm(r.data.render_model as Record<string, unknown>);
            }
            setErr(msg);
          }
          throw e;
        }

        const stillHere = worksheetIdRef.current === targetWorksheetId;
        completeJob(jid, {
          successMessage: stillHere
            ? 'Seite überarbeitet und gespeichert.'
            : 'Seite überarbeitet und gespeichert. Das Arbeitsblatt liegt im Aktivitätsbereich unter „Öffnen“.',
          ...(!stillHere
            ? {
                primaryAction: {
                  label: 'Arbeitsblatt öffnen',
                  to: `/app/worksheets/${targetWorksheetId}`,
                },
              }
            : {}),
        });

        void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      });
    },
    [
      ws,
      id,
      draft,
      startJob,
      runSerialized,
      updateJob,
      completeJob,
      failJob,
      queryClient,
      clearDraftUndoStack,
    ],
  );

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
  const libraryPublishLabel = user?.is_staff ? 'In öffentliche Bibliothek legen' : 'Zur Freigabe einreichen';
  const libraryWithdrawLabel = user?.is_staff
    ? 'Aus öffentlicher Bibliothek nehmen'
    : libMod === 'pending'
      ? 'Einreichung zurückziehen'
      : 'Aus öffentlicher Bibliothek nehmen';

  const runLibraryListingPatch = async (body: Record<string, unknown>) => {
    if (!id) return;
    setLibraryBusy(true);
    setLibraryModalError(null);
    setErr('');
    try {
      const r = await api.patch<Worksheet>(`/worksheets/${id}/`, body);
      setWs(r.data);
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('all') });
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('mine') });
      void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
    } catch (e: unknown) {
      const msg = formatWorksheetApiError(e);
      setLibraryModalError(msg);
      setErr(msg);
      throw e;
    } finally {
      setLibraryBusy(false);
    }
  };

  const handleLibraryPublishOpen = () => {
    if (!id || isReadOnly || !ws) return;
    setLibraryModalError(null);
    setLibraryModalMode('publish');
  };

  const handleLibraryListingEditOpen = () => {
    if (!id || isReadOnly || !ws) return;
    setLibraryModalError(null);
    setLibraryModalMode('edit_listing');
  };

  const handleLibraryModalSubmit = async (p: BoardLibraryListingForm) => {
    if (!libraryModalMode || !id) return;
    try {
      if (libraryModalMode === 'publish') {
        await runLibraryListingPatch({ library_public: true, ...p });
      } else {
        await runLibraryListingPatch({ ...p });
      }
      setLibraryModalMode(null);
      setLibraryModalError(null);
      setErr('');
    } catch {}
  };

  const handleLibraryWithdraw = async () => {
    if (!id || isReadOnly || !ws) return;
    const mod = ws.library_moderation_status ?? 'none';
    const listed = ws.library_public === true && mod === 'approved';

    if (user?.is_staff) {
      if (!ws.library_public) return;
      if (!window.confirm('Arbeitsblatt aus der öffentlichen Bibliothek entfernen?')) return;
      setLibraryBusy(true);
      setErr('');
      try {
        const r = await api.patch<Worksheet>(`/worksheets/${id}/`, { library_public: false });
        setWs(r.data);
        void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('all') });
        void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('mine') });
        void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      } catch (e: unknown) {
        setErr(formatWorksheetApiError(e));
      } finally {
        setLibraryBusy(false);
      }
      return;
    }

    if (mod === 'pending') {
      if (!window.confirm('Die Einreichung zurückziehen?')) return;
      setLibraryBusy(true);
      setErr('');
      try {
        const r = await api.patch<Worksheet>(`/worksheets/${id}/`, { library_public: false });
        setWs(r.data);
        void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('all') });
        void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('mine') });
        void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      } catch (e: unknown) {
        setErr(formatWorksheetApiError(e));
      } finally {
        setLibraryBusy(false);
      }
      return;
    }

    if (listed) {
      if (!window.confirm('Arbeitsblatt aus der öffentlichen Bibliothek entfernen?')) return;
      setLibraryBusy(true);
      setErr('');
      try {
        const r = await api.patch<Worksheet>(`/worksheets/${id}/`, { library_public: false });
        setWs(r.data);
        void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('all') });
        void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('mine') });
        void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      } catch (e: unknown) {
        setErr(formatWorksheetApiError(e));
      } finally {
        setLibraryBusy(false);
      }
    }
  };

  const handleStaffUnpublishWorksheet = async () => {
    if (!id) return;
    if (!window.confirm('Arbeitsblatt aus der öffentlichen Bibliothek entfernen?')) return;
    setStaffLibBusy(true);
    setErr('');
    try {
      await backofficeUnpublishWorksheet(id);
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('all') });
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('mine') });
      void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      navigate('/app/boards/library', { replace: true });
    } catch (e: unknown) {
      const m = e as { response?: { data?: { detail?: string } } };
      setErr(m.response?.data?.detail ?? 'Aktion fehlgeschlagen.');
    } finally {
      setStaffLibBusy(false);
    }
  };

  const handleStaffDeleteWorksheet = async () => {
    if (!id) return;
    if (
      !window.confirm('Dieses Arbeitsblatt endgültig löschen? Alle Daten gehen unwiderruflich verloren.')
    ) {
      return;
    }
    setStaffLibBusy(true);
    setErr('');
    try {
      await backofficeDeleteWorksheet(id);
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('all') });
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('mine') });
      void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      navigate('/app/boards/library', { replace: true });
    } catch (e: unknown) {
      const m = e as { response?: { data?: { detail?: string } } };
      setErr(m.response?.data?.detail ?? 'Löschen fehlgeschlagen.');
    } finally {
      setStaffLibBusy(false);
    }
  };

  const displayRm = previewRm ?? ((ws.render_model || {}) as Record<string, unknown>);

  const viewWorksheet: Worksheet = {
    ...ws,
    title: String(draft.title ?? ws.title) as string,
    render_model: displayRm,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-app)] lg:min-h-0 lg:flex-row print:h-auto print:min-h-0 print:flex-none print:bg-white print:overflow-visible">
      {libraryModalMode !== null && ws ? (
        <BoardLibraryPublishModal
          open
          mode={libraryModalMode === 'edit_listing' ? 'edit_listing' : 'publish'}
          resourceKind="worksheet"
          onClose={() => {
            if (libraryBusy) return;
            setLibraryModalMode(null);
            setLibraryModalError(null);
          }}
          busy={libraryBusy}
          error={libraryModalError}
          privateHints={{ title: ws.title, topic: ws.topic }}
          initialListing={
            libraryModalMode === 'edit_listing'
              ? {
                  library_listing_title: ws.library_listing_title ?? '',
                  library_listing_topic: ws.library_listing_topic ?? '',
                  library_listing_description: ws.library_listing_description ?? '',
                }
              : undefined
          }
          onSubmit={(p) => void handleLibraryModalSubmit(p)}
          moderationRequired={!user?.is_staff}
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col print:min-h-0 print:flex-none">
        <div className="no-print relative z-[45] shrink-0">
          <WorksheetDetailPageHeader
            ws={ws}
            displayTitle={String(draft.title ?? ws.title)}
            readOnly={isReadOnly}
            userIsStaff={Boolean(user?.is_staff)}
            libraryBusy={libraryBusy}
            libraryPublishLabel={libraryPublishLabel}
            libraryWithdrawLabel={libraryWithdrawLabel}
            libListed={libListed}
            libMod={libMod}
            onLibraryPublish={() => handleLibraryPublishOpen()}
            onLibraryWithdraw={() => void handleLibraryWithdraw()}
            onLibraryListingEdit={libListed && !isReadOnly ? () => handleLibraryListingEditOpen() : undefined}
            staffLibBusy={staffLibBusy}
            onStaffUnpublish={() => void handleStaffUnpublishWorksheet()}
            onStaffDelete={() => void handleStaffDeleteWorksheet()}
            saving={saving}
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={() => void save()}
            statusLabel={
              ws.updated_at
                ? `Zuletzt geändert ${new Date(String(ws.updated_at)).toLocaleString('de-DE')}`
                : undefined
            }
            onUndo={isReadOnly ? undefined : handleDraftUndo}
            canUndo={canDraftUndo}
          />
        </div>

      <div className="relative z-0 flex min-h-0 flex-1 flex-col print:h-auto print:min-h-0 print:overflow-visible">
        <div
          className={cn(
            'relative flex min-h-0 flex-1 flex-col overflow-hidden print:h-auto print:overflow-visible',
          )}
        >
          <div className="relative min-h-0 flex flex-1 flex-col">
            <div
              ref={previewScrollRef}
              className={cn(
                'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-16 pt-4 sm:px-5 print:overflow-visible print:pb-0 print:pt-0',
                previewScrollPadTransition && 'transition-[padding] duration-300 ease-out',
              )}
            >
              <div className="print:block">
                <div className="flex min-h-0 min-w-0 justify-center print:block print:w-full print:justify-start">
                  <div className="w-full max-w-full shrink-0 overflow-x-hidden overflow-y-visible rounded-lg border border-slate-200 bg-white shadow-sm lg:mx-auto lg:w-fit lg:max-w-full print:mx-0 print:max-w-none print:w-full print:min-w-0 print:overflow-visible print:border-0 print:rounded-none print:bg-transparent print:shadow-none">
                    <A4WorksheetRenderer
                      worksheet={viewWorksheet}
                      showGuide={false}
                      onPageLayoutOverflow={handlePageLayoutOverflow}
                    />
                  </div>
                </div>
              </div>
            </div>

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
          </div>

          {!editDock.isLgViewport && !isReadOnly ? (
            <div className="no-print flex h-[min(45vh,28rem)] min-h-[12rem] max-h-[50vh] shrink-0 flex-col border-t border-[var(--color-border)] bg-[var(--color-bg-card)] lg:hidden">
              <WorksheetEditSidebar
                draft={draft}
                setDraft={handleDraftFromSheet}
                displayTitle={String(draft.title ?? ws.title)}
                err={err}
                pageLayoutOverflow={pageLayoutOverflow}
                onRegenerateWorksheetPage={handleRegenerateWorksheetPage}
                worksheetPageKiUi={worksheetPageKiUi}
              />
            </div>
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
              pageLayoutOverflow={pageLayoutOverflow}
              rootElement="div"
              onRegenerateWorksheetPage={handleRegenerateWorksheetPage}
              worksheetPageKiUi={worksheetPageKiUi}
            />
          }
        />
      ) : null}
    </div>
  );
}

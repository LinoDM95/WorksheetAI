import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { Alert, Button, Field, IconButton, TextInput } from '../../../components/ui';
import { BOARDS_BLOCKS_QUERY_KEY, BOARDS_DETAIL_QUERY_KEY, BOARDS_LIST_QUERY_KEY } from '../../../lib/listQueries';
import { fetchBlockRegistry, generateBoardFromBlocks } from '../boardsApi';
import type { BlockRegistryEntry, CompositionPlan } from '../types';
import { addPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';
import { canAddSlot, useBoardBuilderState } from './useBoardBuilderState';
import { BlockLibraryPanel } from './BlockLibraryPanel';
import { PageEditor, type PageEditorHandle } from './PageEditor';
import { PagesRail } from './PagesRail';
import { LIBRARY_SUBJECT_FILTER_LABELS } from '../lib/libraryCatalogFilters';
import { cn } from '../../../lib/cn';
import { useAiGenerationJobs } from '../../../components/ai-generation/AiGenerationJobsContext';
import { AI_GENERATION_QUEUE_FULL_MESSAGE } from '../../../components/ai-generation/aiGenerationTypes';
import { isUserCancelledGenerationError } from '../../../components/ai-generation/generationQueue';

type Props = {
  open: boolean;
  onClose: () => void;
  onPendingHighlightChange?: () => void;
};

export const BoardBuilderModal = ({ open, onClose, onPendingHighlightChange }: Props) => {
  const queryClient = useQueryClient();
  const { startJob, updateJob, completeJob, failJob, runSerialized, jobs } = useAiGenerationJobs();
  const sessionBlocksJobIdsRef = useRef(new Set<string>());
  const registryQ = useQuery({
    queryKey: BOARDS_BLOCKS_QUERY_KEY,
    queryFn: fetchBlockRegistry,
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const blocks: BlockRegistryEntry[] = registryQ.data?.blocks ?? [];
  const categories = registryQ.data?.categories ?? [];
  const themes = registryQ.data?.themes ?? [];

  const [state, dispatch] = useBoardBuilderState();
  const { plan, pageIndex } = state;
  const currentPage = plan.pages[pageIndex];
  const pageEditorRef = useRef<PageEditorHandle>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const persistCurrentPageBullets = useCallback(() => {
    const snap = pageEditorRef.current?.getBulletsSnapshot();
    if (snap === undefined) return;
    dispatch({ type: 'set_page_bullets', pageIndex, bullets: snap });
  }, [pageIndex, dispatch]);

  const handleSelectPage = useCallback(
    (i: number) => {
      persistCurrentPageBullets();
      dispatch({ type: 'select_page', pageIndex: i });
    },
    [persistCurrentPageBullets, dispatch],
  );

  const handleAddPage = useCallback(() => {
    persistCurrentPageBullets();
    dispatch({ type: 'add_page' });
  }, [persistCurrentPageBullets, dispatch]);

  const handleRemovePage = useCallback(
    (i: number) => {
      persistCurrentPageBullets();
      dispatch({ type: 'remove_page', pageIndex: i });
    },
    [persistCurrentPageBullets, dispatch],
  );

  const [blocksGenerateError, setBlocksGenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      sessionBlocksJobIdsRef.current.clear();
      setBlocksGenerateError(null);
    }
  }, [open]);

  const busy = jobs.some(
    (j) =>
      sessionBlocksJobIdsRef.current.has(j.id) &&
      j.kind === 'board-blocks' &&
      j.status === 'running',
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (e.key === 'Escape' && !isEditable) onClose();
      if (e.key === 'ArrowLeft' && !isEditable) {
        handleSelectPage(Math.max(0, pageIndex - 1));
      }
      if (e.key === 'ArrowRight' && !isEditable) {
        handleSelectPage(Math.min(plan.pages.length - 1, pageIndex + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose, pageIndex, plan.pages.length, handleSelectPage]);

  const totalSlots = plan.pages.reduce((sum, p) => sum + p.block_slots.length, 0);
  const submitDisabled = totalSlots === 0 || busy || !plan.title.trim();

  const handleSubmit = () => {
    if (submitDisabled) return;
    setPlanError(null);
    if (!plan.subject.trim()) {
      setPlanError('Bitte wähle ein Fach.');
      return;
    }
    if (!plan.title.trim()) {
      setPlanError('Bitte gib einen Titel an.');
      return;
    }
    const snap = pageEditorRef.current?.getBulletsSnapshot() ?? currentPage.bullets;
    const pagesMerged = plan.pages.map((p, idx) => (idx === pageIndex ? { ...p, bullets: snap } : p));
    const emptyBulletPages = pagesMerged.filter((p) => p.bullets.length === 0).length;
    const hasGlobalTopic = (plan.topic.trim() || plan.title.trim()).length > 0;
    if (emptyBulletPages > 0 && !hasGlobalTopic) {
      setPlanError(
        emptyBulletPages === 1
          ? 'Mindestens eine Seite hat noch keine Stichpunkte — bitte ergänzen oder ein globales Thema/Titel setzen.'
          : `${emptyBulletPages} Seiten haben noch keine Stichpunkte — bitte ergänzen oder ein globales Thema/Titel setzen.`,
      );
      return;
    }
    dispatch({ type: 'set_page_bullets', pageIndex, bullets: snap });
    const payload: CompositionPlan = {
      ...plan,
      pages: pagesMerged,
      title: plan.title.trim(),
    };
    const jid = startJob({
      kind: 'board-blocks',
      title: 'Board aus Bausteinen wird erstellt',
      subtitle: payload.title.trim() || payload.topic.trim() || undefined,
    });
    if (!jid) {
      setBlocksGenerateError(AI_GENERATION_QUEUE_FULL_MESSAGE);
      return;
    }
    sessionBlocksJobIdsRef.current.add(jid);
    setBlocksGenerateError(null);
    void runSerialized(jid, async (signal) => {
      try {
        updateJob(jid, {
          phaseLabel: 'KI füllt Bausteine und komponiert das Board …',
          progressPercent: null,
        });
        const board = await generateBoardFromBlocks(payload, signal);
        queryClient.setQueryData(BOARDS_DETAIL_QUERY_KEY(String(board.id)), board);
        queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
        addPendingFirstOpenBoard(board.id);
        onPendingHighlightChange?.();
        completeJob(jid, { successMessage: 'Board ist in deiner Galerie.' });
        onClose();
      } catch (err: unknown) {
        if (isUserCancelledGenerationError(err)) return;
        const detail =
          (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail
          || (err as Error)?.message
          || 'Generierung fehlgeschlagen.';
        failJob(jid, detail);
        setBlocksGenerateError(detail);
      } finally {
        sessionBlocksJobIdsRef.current.delete(jid);
      }
    });
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-stretch justify-center p-2 sm:p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
        aria-label="Builder schließen"
        onClick={() => {
          onClose();
        }}
      />
      <div className="relative z-10 flex min-h-0 w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Board aus Bausteinen</h2>
            <p className="text-[11px] leading-snug text-slate-500">
              Du gibst nur die Themen-Stichpunkte pro Seite an — die KI füllt die gewählten Bausteine selbständig.
              <span className="ml-2 hidden md:inline text-slate-400">Shortcuts: ←/→ Seitenwechsel · Esc schließen</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-slate-500 md:inline">
              {totalSlots} Baustein{totalSlots === 1 ? '' : 'e'} · {plan.pages.length} Seite{plan.pages.length === 1 ? '' : 'n'}
            </span>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitDisabled}
              loading={busy}
              leftIcon={<Sparkles size={14} aria-hidden />}
              size="sm"
            >
              Board erzeugen
            </Button>
            <IconButton type="button" variant="ghost" size="sm" aria-label="Schließen" onClick={onClose}>
              <X size={16} aria-hidden />
            </IconButton>
          </div>
        </div>

        {/* Globale Meta + Theme */}
        <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
          <Field label="Fach" htmlFor="bb-subject" className="min-w-[180px]">
            <select
              id="bb-subject"
              className={cn(
                'select h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-0 text-sm text-slate-900',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30',
              )}
              value={plan.subject}
              onChange={(e) => dispatch({ type: 'set_meta', field: 'subject', value: e.target.value })}
              aria-required
            >
              <option value="">Bitte wählen …</option>
              {LIBRARY_SUBJECT_FILTER_LABELS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Klasse" className="min-w-[80px]">
            <TextInput
              value={plan.grade}
              onChange={(e) => dispatch({ type: 'set_meta', field: 'grade', value: e.target.value })}
              placeholder="z. B. 5"
            />
          </Field>
          <Field label="Titel" className="min-w-[220px] flex-1" required>
            <TextInput
              value={plan.title}
              onChange={(e) => dispatch({ type: 'set_meta', field: 'title', value: e.target.value })}
              placeholder="z. B. Statistik in der Klasse"
              aria-required
            />
          </Field>
          <Field label="Thema" className="min-w-[200px] flex-1">
            <TextInput
              value={plan.topic}
              onChange={(e) => dispatch({ type: 'set_meta', field: 'topic', value: e.target.value })}
              placeholder="z. B. Statistik — gilt als globaler Kontext für alle Seiten"
            />
          </Field>
          <Field label="Stilrichtung (optional)" className="min-w-[200px] flex-1">
            <TextInput
              value={plan.style_hint}
              onChange={(e) => dispatch({ type: 'set_meta', field: 'style_hint', value: e.target.value })}
              placeholder="z. B. kindgerecht, freundlich"
            />
          </Field>
          <Field label="Look" className="min-w-[160px]">
            <select
              value={plan.theme_id}
              onChange={(e) => dispatch({ type: 'set_meta', field: 'theme_id', value: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              <option value="auto">Automatisch</option>
              {themes.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Body grid: Library | Page Editor */}
        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
          <BlockLibraryPanel
            blocks={blocks}
            categories={categories}
            canAdd={(b) => canAddSlot(currentPage, blocks, b)}
            onAdd={(b) => dispatch({ type: 'add_slot', pageIndex, block: b })}
          />
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              <PageEditor
                ref={pageEditorRef}
                page={currentPage}
                pageIndex={pageIndex}
                registry={blocks}
                onTitleChange={(value) => dispatch({ type: 'set_page_title', pageIndex, title: value })}
                onBulletsChange={(bullets) => dispatch({ type: 'set_page_bullets', pageIndex, bullets })}
                onSlotMove={(instanceId, direction) => dispatch({ type: 'move_slot', pageIndex, instanceId, direction })}
                onSlotRemove={(instanceId) => dispatch({ type: 'remove_slot', pageIndex, instanceId })}
                onSlotHint={(instanceId, hint) => dispatch({ type: 'set_slot_hint', pageIndex, instanceId, hint })}
              />
            </div>
            <PagesRail
              plan={plan}
              pageIndex={pageIndex}
              registry={blocks}
              onSelect={handleSelectPage}
              onAdd={handleAddPage}
              onRemove={handleRemovePage}
            />
          </div>
        </div>

        {/* Hinweise / Fehler */}
        {(blocksGenerateError || (totalSlots === 0 && !busy) || planError) && (
          <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-4 py-2">
            {totalSlots === 0 && !busy && !blocksGenerateError && !planError && (
              <p className="text-[12px] text-slate-500">
                Wähle links mindestens einen Baustein, dann kannst du das Board erzeugen lassen.
              </p>
            )}
            {planError && (
              <p className="text-[12px] text-amber-800">{planError}</p>
            )}
            {blocksGenerateError && (
              <Alert tone="error">
                {blocksGenerateError}
              </Alert>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

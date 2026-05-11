import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp, Maximize2, Minimize2, QrCode, RotateCw } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { FreeHtmlBoardFrame } from './free-html/FreeHtmlBoardFrame';
import {
  boardStageClipBoxStyle,
  boardStageScaledInnerStyle,
  STAGE_BASE_H,
  STAGE_BASE_W,
  useBoardStageScale,
} from '../boardStageLayout';
import type { DatasetId, LibraryId } from '../types';

const TOOLBAR_FAB_SIZE = 44;
const TOOLBAR_FAB_MARGIN = 12;
const TOOLBAR_FAB_PORTAL_Z = 2147483646;
const TOOLBAR_DRAG_THRESHOLD_PX = 8;

function clampToolbarFabPosition(left: number, top: number): { left: number; top: number } {
  if (typeof window === 'undefined') return { left, top };
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pad = 8;
  return {
    left: Math.min(Math.max(pad, left), w - TOOLBAR_FAB_SIZE - pad),
    top: Math.min(Math.max(pad, top), h - TOOLBAR_FAB_SIZE - pad),
  };
}

function defaultToolbarFabPosition(): { left: number; top: number } {
  if (typeof window === 'undefined') {
    return { left: TOOLBAR_FAB_MARGIN, top: TOOLBAR_FAB_MARGIN };
  }
  return clampToolbarFabPosition(TOOLBAR_FAB_MARGIN, TOOLBAR_FAB_MARGIN);
}

type DocumentWithVt = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> };
};

export type BoardFullscreenToolbarContext = {
  browserFs: boolean;
};

export type BoardFullscreenPreviewProps = {
  layoutKey: string;
  viewTransitionGroupName: string;
  eyebrowTitle?: string;
  eyebrowSubtitle?: string;
  /** Zusätzliche Toolbar-Inhalte direkt neben „Neu laden“ (z. B. Live-Badge). */
  toolbarExtras?: ReactNode | ((ctx: BoardFullscreenToolbarContext) => ReactNode);
  reloadKey: number;
  onReload: () => void;
  html: string;
  css: string;
  javascript: string;
  boardFrameId: string;
  usedLibraries?: LibraryId[];
  usedDatasets?: DatasetId[];
  scriptsEnabled?: boolean;
  showScriptsToggle?: boolean;
  onScriptsEnabledChange?: (enabled: boolean) => void;
  shareToolbarAction?: {
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
    /** Tooltip; Standard: Kurzbeschreibung Schüler-Link. */
    title?: string;
    ariaLabel?: string;
  };
  /**
   * Dunkle Leiste + Bühne `inset-0` wie Lehrer-Großdarstellung, ohne dass dieses DIV per F11/Fullscreen-API
   * aktiv sein muss (z. B. Schüler-Link: Vollbild liegt auf documentElement).
   */
  forceFullscreenLayout?: boolean;
  /** Nur `toolbarExtras` + Standard-Titelzeile; kein Neu laden / Teilen / Skripte / Vollbild-Toggle. */
  minimalToolbar?: boolean;
  /** Bei `minimalToolbar`: Reload-Icon anzeigen (z. B. Schüler-Link ohne Lehrer-Leiste). */
  showReloadInMinimalToolbar?: boolean;
  /** Kopfzeile (Titel + Aktionen) per Button ein-/ausklappbar — z. B. Schüler-Vollbild. */
  toolbarCollapsible?: boolean;
  clipBoxClassName?: string;
  className?: string;
  /** Gleiche Wurzel wie Fullscreen-Ziel — Schüler-Teilen-Overlays per Portal hier einhängen, damit sie im Randlos-Modus sichtbar bleiben. */
  shareOverlayPortalRef?: MutableRefObject<HTMLDivElement | null>;
};

export function BoardFullscreenPreview({
  layoutKey,
  viewTransitionGroupName,
  eyebrowTitle = 'Live-Vorschau',
  eyebrowSubtitle = 'Tippe und teste wie im Unterricht — Sandbox mit Skripten.',
  toolbarExtras,
  reloadKey,
  onReload,
  html,
  css,
  javascript,
  boardFrameId,
  usedLibraries = [],
  usedDatasets,
  scriptsEnabled = true,
  showScriptsToggle = false,
  onScriptsEnabledChange,
  shareToolbarAction,
  forceFullscreenLayout = false,
  minimalToolbar = false,
  showReloadInMinimalToolbar = false,
  toolbarCollapsible = false,
  clipBoxClassName = 'shadow-inner',
  className,
  shareOverlayPortalRef,
}: BoardFullscreenPreviewProps) {
  const livePreviewFullscreenRef = useRef<HTMLDivElement>(null);
  const assignLivePreviewRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      livePreviewFullscreenRef.current = node;
      if (shareOverlayPortalRef) shareOverlayPortalRef.current = node;
    },
    [shareOverlayPortalRef],
  );
  const stageOuterRef = useRef<HTMLDivElement>(null);
  const clipMotion = useAnimationControls();
  const reduceMotion = useReducedMotion();
  const fsTrackedRef = useRef<boolean | null>(null);
  const vtSupported = useMemo(
    () => typeof document !== 'undefined' && typeof (document as DocumentWithVt).startViewTransition === 'function',
    [],
  );

  const [browserFs, setBrowserFs] = useState(false);
  const [toolbarExpanded, setToolbarExpanded] = useState(true);
  const [toolbarFabPos, setToolbarFabPos] = useState(defaultToolbarFabPosition);
  const toolbarFabPosRef = useRef(toolbarFabPos);
  const toolbarFabDragTeardownRef = useRef<(() => void) | null>(null);
  const toolbarFabElRef = useRef<HTMLButtonElement | null>(null);
  const prevToolbarCollapsedRef = useRef(false);
  const layoutFs = forceFullscreenLayout || browserFs;

  const stageScale = useBoardStageScale(
    stageOuterRef,
    STAGE_BASE_W,
    STAGE_BASE_H,
    `${layoutKey}-${layoutFs ? 'fullscreen' : 'embed'}`,
  );

  const toggleLivePreviewFullscreen = useCallback(async () => {
    const el = livePreviewFullscreenRef.current;
    if (!el) return;

    const runFs = async () => {
      try {
        if (document.fullscreenElement === el) {
          await document.exitFullscreen();
          return;
        }
        if (document.fullscreenElement && document.fullscreenElement !== el) {
          await document.exitFullscreen();
        }
        if (document.fullscreenElement !== el) {
          await el.requestFullscreen();
        }
      } catch {
        /* abgelehnt oder API nicht verfügbar */
      }
    };

    if (reduceMotion !== true && vtSupported) {
      try {
        await (document as DocumentWithVt).startViewTransition!(runFs).finished;
        return;
      } catch {
        /* Fallback ohne View Transition */
      }
    }
    await runFs();
  }, [reduceMotion, vtSupported]);

  useEffect(() => {
    const sync = () => {
      const root = livePreviewFullscreenRef.current;
      setBrowserFs(Boolean(root && document.fullscreenElement === root));
    };
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    if (reduceMotion === true || vtSupported) return;
    if (fsTrackedRef.current === null) {
      fsTrackedRef.current = browserFs;
      return;
    }
    if (fsTrackedRef.current === browserFs) return;
    fsTrackedRef.current = browserFs;

    const ease = [0.33, 1, 0.68, 1] as const;
    void clipMotion.start(
      browserFs
        ? {
            scale: [0.86, 1],
            opacity: [0.9, 1],
            transition: { duration: 0.52, ease },
          }
        : {
            scale: [1.09, 1],
            opacity: 1,
            transition: { duration: 0.46, ease },
          },
    );
  }, [browserFs, clipMotion, reduceMotion, vtSupported]);

  useEffect(() => {
    return () => {
      try {
        const el = livePreviewFullscreenRef.current;
        if (el && document.fullscreenElement === el) {
          void document.exitFullscreen();
        }
      } catch {
        /* ignore */
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!toolbarCollapsible) return;
    const collapsed = !toolbarExpanded;
    if (collapsed && !prevToolbarCollapsedRef.current) {
      setToolbarFabPos(defaultToolbarFabPosition());
    }
    prevToolbarCollapsedRef.current = collapsed;
  }, [toolbarCollapsible, toolbarExpanded]);

  useEffect(() => {
    if (!toolbarCollapsible || toolbarExpanded) return;
    const onResize = () => {
      setToolbarFabPos((p) => clampToolbarFabPosition(p.left, p.top));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [toolbarCollapsible, toolbarExpanded]);

  useLayoutEffect(() => {
    toolbarFabPosRef.current = toolbarFabPos;
  }, [toolbarFabPos]);

  useEffect(() => {
    return () => {
      toolbarFabDragTeardownRef.current?.();
      toolbarFabDragTeardownRef.current = null;
    };
  }, []);

  const handleToolbarFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    toolbarFabDragTeardownRef.current?.();
    toolbarFabDragTeardownRef.current = null;

    const el = toolbarFabElRef.current;
    if (!el) return;

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const { left: origLeft, top: origTop } = toolbarFabPosRef.current;
    let dragged = false;

    el.style.willChange = 'transform';

    let teardown: () => void;

    const applyClampedDelta = (clientX: number, clientY: number) => {
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (Math.hypot(dx, dy) > TOOLBAR_DRAG_THRESHOLD_PX) dragged = true;
      const next = clampToolbarFabPosition(origLeft + dx, origTop + dy);
      toolbarFabPosRef.current = next;
      el.style.transform = `translate3d(${next.left - origLeft}px, ${next.top - origTop}px, 0)`;
    };

    const onWindowMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      applyClampedDelta(ev.clientX, ev.clientY);
    };

    const onWindowEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      applyClampedDelta(ev.clientX, ev.clientY);
      const final = toolbarFabPosRef.current;
      el.style.transform = '';
      el.style.willChange = '';
      setToolbarFabPos(final);
      teardown();
      if (!dragged) {
        setToolbarExpanded(true);
      }
    };

    teardown = () => {
      window.removeEventListener('pointermove', onWindowMove, true);
      window.removeEventListener('pointerup', onWindowEnd, true);
      window.removeEventListener('pointercancel', onWindowEnd, true);
      toolbarFabDragTeardownRef.current = null;
    };

    toolbarFabDragTeardownRef.current = teardown;
    window.addEventListener('pointermove', onWindowMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onWindowEnd, true);
    window.addEventListener('pointercancel', onWindowEnd, true);
  };

  const vtStyle =
    vtSupported && reduceMotion !== true && browserFs ? { viewTransitionName: viewTransitionGroupName } : undefined;

  const toolbarResolved =
    typeof toolbarExtras === 'function' ? toolbarExtras({ browserFs }) : toolbarExtras;

  const showReloadButton = !minimalToolbar || showReloadInMinimalToolbar;
  const reloadTitle = showReloadInMinimalToolbar && minimalToolbar ? 'Übung neu laden' : 'Vorschau neu laden';
  const reloadPlacedEarly = minimalToolbar && showReloadInMinimalToolbar && showReloadButton;

  const reloadIconButton = showReloadButton ? (
    <IconButton
      type="button"
      variant="secondary"
      size="sm"
      className={cn(layoutFs && '!border-white/20 !bg-white/10 !text-white hover:!bg-white/15')}
      title={reloadTitle}
      aria-label={reloadTitle}
      onClick={onReload}
    >
      <RotateCw size={14} aria-hidden />
    </IconButton>
  ) : null;

  const actionsClass = cn('flex shrink-0 flex-wrap items-center justify-end gap-1.5');

  const scaledBoardStage = (
    <div style={boardStageScaledInnerStyle(stageScale)}>
      <FreeHtmlBoardFrame
        html={html}
        css={css}
        javascript={javascript}
        scriptsEnabled={scriptsEnabled}
        reloadKey={reloadKey}
        boardFrameId={boardFrameId}
        usedLibraries={usedLibraries}
        usedDatasets={usedDatasets}
        fillHeight
        fitContainer
        className="!h-full !min-h-0 !rounded-none !ring-0"
      />
    </div>
  );

  const toolbarFabNode =
    toolbarCollapsible && !toolbarExpanded ? (
      <div
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: TOOLBAR_FAB_PORTAL_Z }}
      >
        <div
          className="pointer-events-auto absolute"
          style={{
            left: toolbarFabPos.left,
            top: toolbarFabPos.top,
            width: TOOLBAR_FAB_SIZE,
            height: TOOLBAR_FAB_SIZE,
          }}
        >
          <IconButton
            ref={toolbarFabElRef}
            type="button"
            variant="secondary"
            size="md"
            className={cn(
              '!h-full !w-full !min-h-0 !min-w-0 shrink-0 touch-none rounded-full border p-0 shadow-lg backdrop-blur-md',
              'cursor-grab active:cursor-grabbing [backface-visibility:hidden]',
              layoutFs
                ? '!border-white/30 !bg-white/20 hover:!bg-white/30 [&]:!text-transparent'
                : '!border-[var(--color-border)] !bg-[var(--color-bg-card)]/75 hover:!bg-[var(--color-bg-card)]/90 [&]:!text-transparent',
            )}
            style={{ touchAction: 'none' }}
            aria-expanded="false"
            aria-label="Kopfzeile anzeigen — zum Verschieben gedrückt halten und ziehen"
            title="Kopfzeile anzeigen (halten & ziehen zum Verschieben)"
            onPointerDown={handleToolbarFabPointerDown}
          >
            <span className="pointer-events-none inline-flex mix-blend-difference text-white" aria-hidden>
              <ChevronDown size={22} strokeWidth={2.25} className="pointer-events-none shrink-0" />
            </span>
          </IconButton>
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={assignLivePreviewRootRef}
      style={vtStyle}
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        layoutFs &&
          'box-border h-[100dvh] max-h-[100dvh] min-h-[100dvh] w-[100dvw] max-w-none overflow-hidden bg-neutral-950',
        className,
      )}
    >
      {!(toolbarCollapsible && !toolbarExpanded) ? (
        <div
          className={cn(
            'relative z-10 flex shrink-0 flex-wrap items-start justify-between gap-2 border-b px-3 py-2 transition-opacity duration-150',
            'border-[var(--color-border)] bg-[var(--color-bg-card)]',
            layoutFs && 'border-white/15 bg-neutral-900/95 text-white',
          )}
        >
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'text-[11px] font-semibold uppercase tracking-wide',
                layoutFs ? 'text-white/70' : 'text-[var(--color-ink-500)]',
              )}
            >
              {eyebrowTitle}
            </p>
            <p
              className={cn(
                'text-xs',
                layoutFs ? 'text-white/80' : 'text-[var(--color-ink-600)]',
              )}
            >
              {eyebrowSubtitle}
            </p>
          </div>
          <div className={actionsClass}>
            {showScriptsToggle && typeof onScriptsEnabledChange === 'function' ? (
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium',
                  'border-[var(--color-border)] bg-[var(--color-bg-muted)] text-[var(--color-ink-700)]',
                  layoutFs &&
                    '!border-white/20 !bg-white/10 text-white backdrop-blur-sm sm:text-xs',
                )}
              >
                <input
                  type="checkbox"
                  checked={scriptsEnabled}
                  onChange={(e) => onScriptsEnabledChange(e.target.checked)}
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 rounded border-[var(--color-border)] accent-indigo-500',
                    layoutFs && 'accent-white',
                  )}
                  aria-label="JavaScript und Skripte in der Vorschau"
                />
                <span className="hidden sm:inline">Skripte</span>
              </label>
            ) : null}
            <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
              {reloadPlacedEarly ? reloadIconButton : null}
              {!reloadPlacedEarly && showReloadButton ? reloadIconButton : null}
              {toolbarResolved}
            </span>
            {!minimalToolbar && shareToolbarAction ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn('!px-2', layoutFs && '!border-white/20 !bg-white/10 !text-white hover:!bg-white/15')}
                title={
                  shareToolbarAction.title ??
                  'QR-Code und Link für Schüler:innen erzeugen'
                }
                aria-label={
                  shareToolbarAction.ariaLabel ?? 'QR und Link für Schülerinnen und Schüler'
                }
                leftIcon={<QrCode size={14} aria-hidden />}
                loading={shareToolbarAction.loading}
                disabled={shareToolbarAction.disabled}
                onClick={shareToolbarAction.onClick}
              >
                <span className="hidden sm:inline">QR &amp; Link</span>
              </Button>
            ) : null}
            {toolbarCollapsible ? (
              <IconButton
                type="button"
                variant="secondary"
                size="sm"
                className={cn(layoutFs && '!border-white/20 !bg-white/10 !text-white hover:!bg-white/15')}
                aria-expanded="true"
                aria-label="Kopfzeile ausblenden"
                title="Kopfzeile ausblenden"
                onClick={() => setToolbarExpanded(false)}
              >
                <ChevronUp size={14} aria-hidden />
              </IconButton>
            ) : null}
            {!minimalToolbar ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn('!px-2', layoutFs && '!border-white/20 !bg-white/10 !text-white hover:!bg-white/15')}
                aria-pressed={browserFs}
                aria-label={
                  browserFs ? 'Großdarstellung beenden — zurück zur eingebetteten Vorschau' : 'Großdarstellung (Vollbild)'
                }
                leftIcon={browserFs ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
                onClick={() => void toggleLivePreviewFullscreen()}
              >
                <span className="hidden sm:inline">{browserFs ? 'Verkleinern' : 'Großdarstellung'}</span>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          'relative z-0 min-h-0 flex-1 overflow-hidden bg-[var(--color-bg-muted)]',
          layoutFs && 'flex-1 bg-neutral-950',
        )}
      >
        <div
          ref={stageOuterRef}
          className={cn(
            'pointer-events-none absolute flex items-center justify-center',
            layoutFs ? 'inset-0' : 'inset-2 sm:inset-3',
          )}
        >
          {vtSupported ? (
            <div
              className={cn('pointer-events-auto bg-white', clipBoxClassName)}
              style={boardStageClipBoxStyle(stageScale)}
            >
              {scaledBoardStage}
            </div>
          ) : (
            <motion.div
              className={cn('pointer-events-auto origin-center bg-white', clipBoxClassName)}
              style={boardStageClipBoxStyle(stageScale)}
              initial={{ scale: 1, opacity: 1 }}
              animate={clipMotion}
            >
              {scaledBoardStage}
            </motion.div>
          )}
        </div>
      </div>
      {typeof document !== 'undefined' && toolbarFabNode ? createPortal(toolbarFabNode, document.body) : null}
    </div>
  );
}

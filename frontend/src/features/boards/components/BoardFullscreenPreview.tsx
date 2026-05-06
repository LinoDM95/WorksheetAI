import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Maximize2, Minimize2, QrCode, RotateCw } from 'lucide-react';
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
  /** Teilen (QR/Link): erscheint direkt vor „Neu laden“. */
  shareToolbarAction?: {
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
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
  clipBoxClassName?: string;
  className?: string;
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
  clipBoxClassName = 'shadow-inner',
  className,
}: BoardFullscreenPreviewProps) {
  const livePreviewFullscreenRef = useRef<HTMLDivElement>(null);
  const stageOuterRef = useRef<HTMLDivElement>(null);
  const clipMotion = useAnimationControls();
  const reduceMotion = useReducedMotion();
  const fsTrackedRef = useRef<boolean | null>(null);
  const vtSupported = useMemo(
    () => typeof document !== 'undefined' && typeof (document as DocumentWithVt).startViewTransition === 'function',
    [],
  );

  const [browserFs, setBrowserFs] = useState(false);
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

  return (
    <div
      ref={livePreviewFullscreenRef}
      style={vtStyle}
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        layoutFs &&
          'box-border h-[100dvh] max-h-[100dvh] min-h-[100dvh] w-[100dvw] max-w-none overflow-hidden bg-neutral-950',
        className,
      )}
    >
      <div
        className={cn(
          'relative z-10 flex shrink-0 flex-wrap items-start justify-between gap-2 border-b px-3 py-2',
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
          {reloadPlacedEarly ? reloadIconButton : null}
          {toolbarResolved}
          {!minimalToolbar && shareToolbarAction ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn('!px-2', layoutFs && '!border-white/20 !bg-white/10 !text-white hover:!bg-white/15')}
              title="QR-Code und Link für Schüler:innen erzeugen"
              aria-label="QR und Link für Schülerinnen und Schüler"
              leftIcon={<QrCode size={14} aria-hidden />}
              loading={shareToolbarAction.loading}
              disabled={shareToolbarAction.disabled}
              onClick={shareToolbarAction.onClick}
            >
              <span className="hidden sm:inline">QR &amp; Link</span>
            </Button>
          ) : null}
          {!reloadPlacedEarly ? reloadIconButton : null}
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
    </div>
  );
}

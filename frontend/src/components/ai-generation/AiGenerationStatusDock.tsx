import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, ChevronDown, Clock, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAiGenerationJobs } from './AiGenerationJobsContext';
import type { AiGenerationJob } from './aiGenerationTypes';

const AUTO_COLLAPSE_MS = 3200;
const PANEL_MAX_H = 'min(80vh, 28rem)';

export function sortJobsForDisplay(jobs: AiGenerationJob[]): AiGenerationJob[] {
  const rank = (s: AiGenerationJob['status']) =>
    s === 'running' ? 0 : s === 'queued' ? 1 : 2;
  return [...jobs].sort((a, b) => {
    const d = rank(a.status) - rank(b.status);
    return d !== 0 ? d : 0;
  });
}

function JobCard({ job, onDismiss }: { job: AiGenerationJob; onDismiss: () => void }) {
  const isRunning = job.status === 'running';
  const isQueued = job.status === 'queued';
  const showBar = isRunning && typeof job.progressPercent === 'number';
  const pct = Math.max(0, Math.min(100, Math.round(job.progressPercent ?? 0)));

  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border bg-[var(--color-bg-card)] px-3 py-2.5',
        'shadow-[var(--shadow-sm)] ring-1 ring-slate-900/[0.04]',
        job.status === 'error'
          ? 'border-red-200/80 bg-red-50/30'
          : 'border-[var(--color-border)]',
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
              isRunning && 'bg-[var(--color-primary-50)] text-[var(--color-primary-600)]',
              isQueued && 'bg-[var(--color-accent-50)] text-[var(--color-accent-700)]',
              job.status === 'success' && 'bg-[var(--color-success-50)] text-[var(--color-success-600)]',
              job.status === 'error' && 'bg-red-50 text-red-600',
            )}
            aria-hidden
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : isQueued ? (
              <Clock className="h-3.5 w-3.5" strokeWidth={2} />
            ) : job.status === 'success' ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold leading-tight text-[var(--color-ink-900)]">{job.title}</p>
            {job.subtitle ? (
              <p className="mt-0.5 truncate text-[11px] text-[var(--color-ink-600)]">{job.subtitle}</p>
            ) : null}
            {isRunning && job.phaseLabel ? (
              <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink-600)]">{job.phaseLabel}</p>
            ) : null}
            {isQueued && job.phaseLabel ? (
              <p className="mt-1 text-[11px] leading-snug text-[var(--color-accent-700)]">{job.phaseLabel}</p>
            ) : null}
            {job.status === 'success' && job.successMessage ? (
              <p className="mt-1 text-[11px] leading-snug text-[var(--color-success-700)]">
                {job.successMessage}
              </p>
            ) : null}
            {job.status === 'error' && job.errorMessage ? (
              <p className="mt-1 text-[11px] leading-snug text-red-700">{job.errorMessage}</p>
            ) : null}
            {job.primaryAction && job.status === 'success' ? (
              <Link
                to={job.primaryAction.to}
                className="mt-2 inline-flex rounded-md text-[11px] font-medium text-[var(--color-primary-600)] underline-offset-4 hover:underline"
              >
                {job.primaryAction.label}
              </Link>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            'shrink-0 rounded-[var(--radius-md)] p-1.5 text-[var(--color-ink-400)]',
            'transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-ink-700)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]/30',
          )}
          aria-label="Eintrag schließen"
        >
          <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
        </button>
      </div>
      {showBar ? (
        <div
          className="mt-2.5"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Fortschritt"
        >
          <div className="h-1 overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
            <motion.div
              className="h-full rounded-full bg-[var(--color-primary-500)]"
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AiGenerationStatusDock() {
  const { jobs, dismissJob } = useAiGenerationJobs();
  const [collapsed, setCollapsed] = useState(true);
  const [userPinnedOpen, setUserPinnedOpen] = useState(false);
  const autoCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPipelineRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelMaxH, setPanelMaxH] = useState(PANEL_MAX_H);

  const jobsSortKey = jobs.map((j) => `${j.id}:${j.status}`).join('|');

  useLayoutEffect(() => {
    if (collapsed || typeof window === 'undefined') return;
    const clamp = () => {
      const el = panelRef.current;
      if (!el) return;
      const margin = 12;
      const bottom = el.getBoundingClientRect().bottom;
      const space = window.innerHeight - bottom - margin;
      if (space < 0) {
        const next = Math.max(160, el.getBoundingClientRect().height + space);
        setPanelMaxH(`${next}px`);
        return;
      }
      setPanelMaxH(PANEL_MAX_H);
    };
    const id = window.requestAnimationFrame(() => clamp());
    window.addEventListener('resize', clamp);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('resize', clamp);
    };
  }, [collapsed, jobs.length, jobsSortKey]);

  const runningCount = jobs.filter((j) => j.status === 'running').length;
  const queuedCount = jobs.filter((j) => j.status === 'queued').length;
  const pipelineCount = runningCount + queuedCount;
  const hasTerminalOnly =
    jobs.length > 0 && jobs.every((j) => j.status === 'success' || j.status === 'error');

  useEffect(() => {
    if (pipelineCount > 0 && autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
      autoCollapseTimerRef.current = null;
    }
    if (pipelineCount > 0 && prevPipelineRef.current === 0) {
      setCollapsed(false);
      setUserPinnedOpen(false);
    }
    prevPipelineRef.current = pipelineCount;
  }, [pipelineCount]);

  useEffect(() => {
    if (pipelineCount > 0 || jobs.length === 0) {
      return;
    }
    if (!hasTerminalOnly) {
      return;
    }
    if (userPinnedOpen) {
      return;
    }
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
    }
    autoCollapseTimerRef.current = window.setTimeout(() => {
      autoCollapseTimerRef.current = null;
      setCollapsed(true);
      setUserPinnedOpen(false);
    }, AUTO_COLLAPSE_MS);
    return () => {
      if (autoCollapseTimerRef.current) {
        clearTimeout(autoCollapseTimerRef.current);
        autoCollapseTimerRef.current = null;
      }
    };
  }, [pipelineCount, jobs.length, hasTerminalOnly, userPinnedOpen]);

  const handleTogglePanel = () => {
    setCollapsed((c) => {
      const next = !c;
      if (!next) {
        setUserPinnedOpen(true);
      } else {
        setUserPinnedOpen(false);
      }
      return next;
    });
  };

  useEffect(() => {
    if (collapsed) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setCollapsed(true);
      setUserPinnedOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [collapsed]);

  useEffect(() => {
    if (collapsed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCollapsed(true);
        setUserPinnedOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed]);

  if (jobs.length === 0) return null;

  const displayJobs = sortJobsForDisplay(jobs);

  const dotClass =
    runningCount > 0
      ? 'bg-[var(--color-primary-500)] shadow-[0_0_0_3px_rgba(99,102,241,0.25)]'
      : queuedCount > 0
        ? 'bg-[var(--color-accent-500)] shadow-[0_0_0_3px_rgba(245,158,11,0.22)]'
        : 'bg-[var(--color-ink-300)]';

  const summary =
    runningCount > 0 && queuedCount > 0
      ? `${runningCount} aktiv, ${queuedCount} wartend`
      : runningCount > 0
        ? runningCount === 1
          ? '1 Auftrag aktiv'
          : `${runningCount} aktiv`
        : queuedCount > 0
          ? queuedCount === 1
            ? '1 in Warteschlange'
            : `${queuedCount} in Warteschlange`
          : jobs.some((j) => j.status === 'error')
            ? 'Status prüfen'
            : 'Fertig';

  return (
    <div className="relative shrink-0 print:hidden" ref={rootRef}>
      <div className="flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={handleTogglePanel}
          className={cn(
            'group flex max-w-[min(calc(100vw-8rem),13.5rem)] items-center gap-1.5 rounded-md bg-transparent sm:max-w-[15rem] sm:gap-2',
            'px-1 py-1.5 sm:px-1.5 sm:py-2',
            'transition-[color,transform] duration-200 ease-out',
            'hover:opacity-90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]/35',
            'active:scale-[0.98]',
          )}
          aria-expanded={!collapsed}
          aria-controls="ai-generation-status-panel"
          aria-label={`KI-Aktivität: ${summary}. ${collapsed ? 'Aufklappen' : 'Einklappen'}.`}
        >
          <span className="relative flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
            <span
              className={cn(
                'absolute h-2 w-2 rounded-full transition-transform duration-200',
                dotClass,
                pipelineCount > 0 && 'motion-safe:animate-pulse motion-reduce:animate-none',
              )}
            />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
            <span className="text-[10px] font-semibold leading-none tracking-tight text-[var(--color-ink-900)] sm:text-[11px]">
              KI-Aktivität
            </span>
            <span className="hidden max-w-[10rem] truncate text-[10px] font-medium text-[var(--color-ink-500)] sm:inline sm:max-w-[11.5rem]">
              {summary}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-[var(--color-ink-400)] transition-transform duration-200 ease-out sm:h-4 sm:w-4',
              'group-hover:text-[var(--color-ink-600)]',
              !collapsed && 'rotate-180',
            )}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        <AnimatePresence initial={false}>
          {!collapsed ? (
            <motion.div
              ref={panelRef}
              id="ai-generation-status-panel"
              role="region"
              aria-label="KI-Generierungen"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'absolute right-0 top-[calc(100%+0.25rem)] z-[70] w-[min(calc(100vw-1rem),18.5rem)] overflow-hidden rounded-[var(--radius-xl)]',
                'border border-[var(--color-border)] bg-[var(--color-bg-card)]/98 shadow-[var(--shadow-paper)] backdrop-blur-md',
              )}
              style={{ maxHeight: panelMaxH }}
            >
              <div
                className="overflow-y-auto overscroll-contain p-2.5 [-webkit-overflow-scrolling:touch]"
                style={{ maxHeight: panelMaxH }}
              >
                <div className="flex flex-col gap-2">
                  <p className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-400)]">
                    Übersicht
                  </p>
                  {displayJobs.map((job) => (
                    <JobCard key={job.id} job={job} onDismiss={() => dismissJob(job.id)} />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

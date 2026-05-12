import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import type {
  AiGenerationCompleteOptions,
  AiGenerationJob,
  AiGenerationJobStartInput,
} from './aiGenerationTypes';
import { AI_GENERATION_MAX_QUEUED } from './aiGenerationTypes';
import { refreshAuthCookies } from '../../lib/api';
import { AiGenerationQueueAbortedError } from './generationQueue';

/** Während langer KI-Läufe Access-Cookie vor Ablauf erneuern (Access default 120 min, Jobs bis 60 min+). */
const PROACTIVE_AUTH_REFRESH_MS = 10 * 60 * 1000;

/** Maximale sichtbare Jobs in der Liste; ältere werden beim Start verworfen. */
export const AI_GENERATION_MAX_JOBS = 6;

type Action =
  | { type: 'start'; job: AiGenerationJob }
  | { type: 'patch'; id: string; patch: Partial<AiGenerationJob> }
  | { type: 'dismiss'; id: string };

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function jobsReducer(jobs: AiGenerationJob[], action: Action): AiGenerationJob[] {
  switch (action.type) {
    case 'start': {
      const queued = jobs.filter((j) => j.status === 'queued').length;
      if (queued >= AI_GENERATION_MAX_QUEUED) return jobs;
      return [action.job, ...jobs].slice(0, AI_GENERATION_MAX_JOBS);
    }
    case 'patch':
      return jobs.map((j) => (j.id === action.id ? { ...j, ...action.patch } : j));
    case 'dismiss':
      return jobs.filter((j) => j.id !== action.id);
    default:
      return jobs;
  }
}

type Ctx = {
  jobs: AiGenerationJob[];
  /** `null`, wenn die Warteschlange voll ist (`AI_GENERATION_MAX_QUEUED`). */
  startJob: (input: AiGenerationJobStartInput) => string | null;
  /** Führt Arbeit strikt nacheinander aus; setzt den Job auf „running“, sobald er an der Reihe ist. */
  runSerialized: <T,>(jobId: string, fn: (signal: AbortSignal) => Promise<T>) => Promise<T>;
  updateJob: (
    id: string,
    patch: Partial<Pick<AiGenerationJob, 'phaseLabel' | 'progressPercent' | 'subtitle'>>,
  ) => void;
  completeJob: (id: string, options?: AiGenerationCompletionInput) => void;
  failJob: (id: string, message: string) => void;
  dismissJob: (id: string) => void;
};

export type AiGenerationCompletionInput = AiGenerationCompleteOptions;

const AiGenerationJobsContext = createContext<Ctx | null>(null);

export function AiGenerationJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<AiGenerationJob[]>([]);
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const queueTailRef = useRef<Promise<unknown>>(Promise.resolve());
  const abortedQueuedIdsRef = useRef(new Set<string>());
  const runningAbortByJobIdRef = useRef(new Map<string, AbortController>());
  const hasActiveGenerationRef = useRef(false);

  useEffect(() => {
    hasActiveGenerationRef.current = jobs.some(
      (j) => j.status === 'queued' || j.status === 'running',
    );
  }, [jobs]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!hasActiveGenerationRef.current) return;
      void refreshAuthCookies().catch(() => undefined);
    }, PROACTIVE_AUTH_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const dispatch = useCallback((action: Action) => {
    setJobs((prev) => jobsReducer(prev, action));
  }, []);

  const runSerialized = useCallback(
    async <T,>(jobId: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      const run = queueTailRef.current.then(async (): Promise<T> => {
        if (abortedQueuedIdsRef.current.has(jobId)) {
          abortedQueuedIdsRef.current.delete(jobId);
          throw new AiGenerationQueueAbortedError();
        }
        await refreshAuthCookies().catch(() => undefined);
        dispatch({ type: 'patch', id: jobId, patch: { status: 'running' } });
        const ac = new AbortController();
        runningAbortByJobIdRef.current.set(jobId, ac);
        try {
          return await fn(ac.signal);
        } catch (e) {
          if (ac.signal.aborted) {
            throw new AiGenerationQueueAbortedError();
          }
          throw e;
        } finally {
          runningAbortByJobIdRef.current.delete(jobId);
        }
      });
      queueTailRef.current = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    [dispatch],
  );

  const startJob = useCallback((input: AiGenerationJobStartInput): string | null => {
    const id = newId();
    const now = Date.now();
    const job: AiGenerationJob = {
      id,
      kind: input.kind,
      title: input.title,
      subtitle: input.subtitle,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input.pageIndex !== undefined ? { pageIndex: input.pageIndex } : {}),
      status: 'queued',
      phaseLabel: 'In der Warteschlange …',
      progressPercent: null,
      createdAt: now,
    };
    let acceptedId: string | null = null;
    flushSync(() => {
      setJobs((prev) => {
        const next = jobsReducer(prev, { type: 'start', job });
        if (next !== prev) acceptedId = id;
        return next;
      });
    });
    return acceptedId;
  }, []);

  const updateJob = useCallback(
    (
      id: string,
      patch: Partial<Pick<AiGenerationJob, 'phaseLabel' | 'progressPercent' | 'subtitle'>>,
    ) => {
      dispatch({ type: 'patch', id, patch });
    },
    [dispatch],
  );

  const completeJob = useCallback(
    (id: string, options?: AiGenerationCompletionInput) => {
      const now = Date.now();
      dispatch({
        type: 'patch',
        id,
        patch: {
          status: 'success',
          progressPercent: 100,
          phaseLabel: undefined,
          successMessage: options?.successMessage ?? 'Fertig.',
          primaryAction: options?.primaryAction,
          endedAt: now,
        },
      });
    },
    [dispatch],
  );

  const failJob = useCallback(
    (id: string, message: string) => {
      const now = Date.now();
      dispatch({
        type: 'patch',
        id,
        patch: {
          status: 'error',
          errorMessage: message,
          endedAt: now,
          progressPercent: null,
        },
      });
    },
    [dispatch],
  );

  const dismissJob = useCallback(
    (id: string) => {
      const j = jobsRef.current.find((x) => x.id === id);
      if (j?.status === 'queued') {
        abortedQueuedIdsRef.current.add(id);
      }
      if (j?.status === 'running') {
        runningAbortByJobIdRef.current.get(id)?.abort();
      }
      dispatch({ type: 'dismiss', id });
    },
    [dispatch],
  );

  const value = useMemo(
    () => ({
      jobs,
      startJob,
      runSerialized,
      updateJob,
      completeJob,
      failJob,
      dismissJob,
    }),
    [jobs, startJob, runSerialized, updateJob, completeJob, failJob, dismissJob],
  );

  return (
    <AiGenerationJobsContext.Provider value={value}>{children}</AiGenerationJobsContext.Provider>
  );
}

export function useAiGenerationJobs(): Ctx {
  const ctx = useContext(AiGenerationJobsContext);
  if (!ctx) {
    throw new Error('useAiGenerationJobs must be used within AiGenerationJobsProvider');
  }
  return ctx;
}

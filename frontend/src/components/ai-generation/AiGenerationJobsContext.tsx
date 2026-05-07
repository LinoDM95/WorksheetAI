import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  AiGenerationCompleteOptions,
  AiGenerationJob,
  AiGenerationJobStartInput,
} from './aiGenerationTypes';
import { AiGenerationQueueAbortedError } from './generationQueue';

const MAX_JOBS = 6;

type State = { jobs: AiGenerationJob[] };

type Action =
  | { type: 'start'; job: AiGenerationJob }
  | { type: 'patch'; id: string; patch: Partial<AiGenerationJob> }
  | { type: 'dismiss'; id: string };

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { jobs: [action.job, ...state.jobs].slice(0, MAX_JOBS) };
    case 'patch':
      return {
        jobs: state.jobs.map((j) => (j.id === action.id ? { ...j, ...action.patch } : j)),
      };
    case 'dismiss':
      return { jobs: state.jobs.filter((j) => j.id !== action.id) };
    default:
      return state;
  }
}

type Ctx = {
  jobs: AiGenerationJob[];
  startJob: (input: AiGenerationJobStartInput) => string;
  /** Führt Arbeit strikt nacheinander aus; setzt den Job auf „running“, sobald er an der Reihe ist. */
  runSerialized: <T,>(jobId: string, fn: () => Promise<T>) => Promise<T>;
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
  const [state, dispatch] = useReducer(reducer, { jobs: [] });
  const jobsRef = useRef(state.jobs);
  useEffect(() => {
    jobsRef.current = state.jobs;
  }, [state.jobs]);

  const queueTailRef = useRef<Promise<unknown>>(Promise.resolve());
  const abortedQueuedIdsRef = useRef(new Set<string>());

  const runSerialized = useCallback(async <T,>(jobId: string, fn: () => Promise<T>): Promise<T> => {
    const run = queueTailRef.current.then(async (): Promise<T> => {
      if (abortedQueuedIdsRef.current.has(jobId)) {
        abortedQueuedIdsRef.current.delete(jobId);
        throw new AiGenerationQueueAbortedError();
      }
      dispatch({ type: 'patch', id: jobId, patch: { status: 'running' } });
      return fn();
    });
    queueTailRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const startJob = useCallback((input: AiGenerationJobStartInput) => {
    const id = newId();
    const now = Date.now();
    const job: AiGenerationJob = {
      id,
      kind: input.kind,
      title: input.title,
      subtitle: input.subtitle,
      status: 'queued',
      phaseLabel: 'In der Warteschlange …',
      progressPercent: null,
      createdAt: now,
    };
    dispatch({ type: 'start', job });
    return id;
  }, []);

  const updateJob = useCallback(
    (
      id: string,
      patch: Partial<Pick<AiGenerationJob, 'phaseLabel' | 'progressPercent' | 'subtitle'>>,
    ) => {
      dispatch({ type: 'patch', id, patch });
    },
    [],
  );

  const completeJob = useCallback((id: string, options?: AiGenerationCompletionInput) => {
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
  }, []);

  const failJob = useCallback((id: string, message: string) => {
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
  }, []);

  const dismissJob = useCallback((id: string) => {
    const j = jobsRef.current.find((x) => x.id === id);
    if (j?.status === 'queued') {
      abortedQueuedIdsRef.current.add(id);
    }
    dispatch({ type: 'dismiss', id });
  }, []);

  const value = useMemo(
    () => ({
      jobs: state.jobs,
      startJob,
      runSerialized,
      updateJob,
      completeJob,
      failJob,
      dismissJob,
    }),
    [state.jobs, startJob, runSerialized, updateJob, completeJob, failJob, dismissJob],
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

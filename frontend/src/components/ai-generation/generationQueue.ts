export class AiGenerationQueueAbortedError extends Error {
  constructor() {
    super('KI-Generierung aus der Warteschlange entfernt.');
    this.name = 'AiGenerationQueueAbortedError';
  }
}

export const isAiGenerationQueueAbortedError = (e: unknown): e is AiGenerationQueueAbortedError =>
  e instanceof AiGenerationQueueAbortedError;

const isAbortLikeNetworkError = (e: unknown): boolean => {
  if (!e || typeof e !== 'object') return false;
  const o = e as { name?: string; code?: string };
  return o.name === 'AbortError' || o.name === 'CanceledError' || o.code === 'ERR_CANCELED';
};

/** Nutzer hat Generierung verworfen (Warteschlange) oder laufenden Request abgebrochen (AbortSignal/Axios). */
export const isUserCancelledGenerationError = (e: unknown): boolean =>
  isAiGenerationQueueAbortedError(e) || isAbortLikeNetworkError(e);
